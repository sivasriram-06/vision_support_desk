const { getDB } = require("../../config/db");
const env = require("../../config/env");
const gmailClient = require("./gmail.client");
const { normalizeMessage } = require("./gmail.normalizer");
const { thread: threadRepository, conversation: conversationRepository } = require("../../repositories/conversation.repository");
const ticketRepository = require("../../repositories/ticket.repository");
const mailReplyAddressRepository = require("../../repositories/mail-reply-address.repository");
const { restoreIngestedThread } = require("./deletion-sync");
const { publish, REALTIME_EVENT } = require("../../realtime/bus");
const gmailIngestedMessageRepository = require("../../repositories/gmail-ingested-message.repository");
const attachmentRepository = require("../../repositories/attachment.repository");
const ticketService = require("../../services/ticket.service");
const contactService = require("../../services/contact.service");
const agentService = require("../../services/agent.service");
const organizationService = require("../../services/organization.service");
const generateId = require("../../utils/generate-id");
const DB_TABLES = require("../../constants/db-tables");
const { saveAttachmentBuffer } = require("../../utils/file-storage");
const logger = require("../../utils/logger");
const ApiError = require("../../utils/api-error");
const ERROR_CODES = require("../../constants/error-codes");
const HTTP_STATUS = require("../../constants/http-status");
const { CHANNEL, DIRECTION, TICKET_HISTORY_EVENT, NEW_EMAIL_TICKET_STATUS, CLOCK_BEHAVIOUR, POST_CLOSE_DECISION } = require("../../constants/ticket.constants");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Gap between full-fetches so a big backfill spreads its Gmail API calls and doesn't trip the per-minute quota.
const PER_MESSAGE_DELAY_MS = 350;

const isQuotaExceededError = (error) => error?.code === 403 && error?.errors?.[0]?.reason === "rateLimitExceeded";

const PAGE_SIZE = 50;
// Safety cap so years of history backfill over a few sync ticks instead of one huge run.
const MAX_PAGES_PER_SYNC = 20;

// "(via Google Sheets)"-style relays share one From; the real sender is Reply-To. Other senders keep From.
const VIA_SUFFIX = /\s*\(via [^)]*\)\s*$/i;

const resolveRequester = (normalized, mailboxAddress) => {
    const from = normalized.from;
    const replyTo = normalized.replyTo && normalized.replyTo[0];
    if (!from.name || !VIA_SUFFIX.test(from.name)) return from;
    if (!replyTo || !replyTo.email || replyTo.email === from.email || replyTo.email === mailboxAddress.toLowerCase()) return from;
    return { email: replyTo.email, name: replyTo.name || from.name.replace(VIA_SUFFIX, "").trim() || null };
};

// Pages past the first so older mail is reachable; stops at a page with nothing new so idle ticks stay cheap.
const listMessageIdsToProcess = async (gmail, query) => {
    const ids = [];
    let pageToken;

    for (let page = 0; page < MAX_PAGES_PER_SYNC; page += 1) {
        const res = await gmail.users.messages.list({ userId: "me", q: query, maxResults: PAGE_SIZE, pageToken });
        const pageMessages = res.data.messages || [];
        if (pageMessages.length === 0) {
            break;
        }

        ids.push(...pageMessages.map((m) => m.id));

        const hasNewOnThisPage = pageMessages.some((m) => !gmailIngestedMessageRepository.isProcessed(m.id));
        if (!hasNewOnThisPage || !res.data.nextPageToken) {
            break;
        }
        pageToken = res.data.nextPageToken;
    }

    return ids;
};

const getFullMessage = async (gmail, id) => {
    const res = await gmail.users.messages.get({ userId: "me", id, format: "full" });
    return res.data;
};

// Large attachments need a separate fetch by attachmentId; runs before the sync transaction (async I/O).
const downloadAttachments = async (gmail, gmailMessageId, attachmentParts) => {
    const files = [];
    for (const part of attachmentParts) {
        let base64Data = part.inlineData;
        if (!base64Data && part.attachmentId) {
            const res = await gmail.users.messages.attachments.get({
                userId: "me",
                messageId: gmailMessageId,
                id: part.attachmentId
            });
            base64Data = res.data.data;
        }
        if (!base64Data) {
            continue;
        }
        files.push({
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.size,
            contentId: part.contentId,
            buffer: Buffer.from(base64Data, "base64")
        });
    }
    return files;
};

const MAX_REMOTE_IMAGE_BYTES = 5 * 1024 * 1024; // generous for a signature/logo, cheap insurance against a runaway download
const REMOTE_IMAGE_FETCH_TIMEOUT_MS = 8000;

// Embeds remote signature images as data: URIs (their CDN rate-limits re-fetches); failures keep the URL.
const embedRemoteImages = async (html) => {
    if (!html) return html;

    const srcPattern = /<img\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["']/gi;
    const urls = new Set();
    let match;
    while ((match = srcPattern.exec(html)) !== null) {
        urls.add(match[1]);
    }

    let resolved = html;
    for (const url of urls) {
        const timeoutController = new AbortController();
        const timeout = setTimeout(() => timeoutController.abort(), REMOTE_IMAGE_FETCH_TIMEOUT_MS);
        try {
            const res = await fetch(url, { signal: timeoutController.signal });
            const contentType = res.headers.get("content-type") || "";
            if (!res.ok || !contentType.startsWith("image/")) {
                continue;
            }

            const buffer = Buffer.from(await res.arrayBuffer());
            if (buffer.length > MAX_REMOTE_IMAGE_BYTES) {
                continue;
            }

            const dataUri = `data:${contentType.split(";")[0]};base64,${buffer.toString("base64")}`;
            resolved = resolved.split(url).join(dataUri);
        } catch (error) {
            logger.warn(`Failed to embed remote image, leaving original URL (${url}): ${error.message}`);
        } finally {
            clearTimeout(timeout);
        }
    }
    return resolved;
};

// Reply -> ticket via In-Reply-To then References (newest first); follows splits to the newest split ticket.
const findTicketIdForReply = (normalized) => {
    const references = normalized.referencesHeader
        ? normalized.referencesHeader.split(/\s+/).filter(Boolean).reverse()
        : [];
    const candidates = [normalized.inReplyToHeader, ...references].filter(Boolean);

    // A ticket a person deleted stays deleted: a reply in its thread opens a new ticket instead of reviving it.
    const deletedByUser = (ticketId) => ticketRepository.findById(ticketId, { includeDeleted: true })?.Is_Deleted === "Y" && ticketService.isDeletedByUser(ticketId);

    for (const messageId of candidates) {
        const thread = threadRepository.findThreadByInReplyTo(messageId);
        if (thread) {
            const ticketId = ticketRepository.findLatestSplitDescendantId(thread.Ticket_Id);
            return deletedByUser(ticketId) ? null : ticketId;
        }
    }
    // Only a Gmail-deleted mail matches: the reply still belongs to its ticket, which is brought back if removed.
    for (const messageId of candidates) {
        const thread = threadRepository.findThreadByMessageId(messageId);
        if (thread) {
            const ticketId = ticketRepository.findLatestSplitDescendantId(thread.Ticket_Id, { includeDeleted: true });
            if (deletedByUser(ticketId)) return null;
            ticketRepository.undeleteById(ticketId, organizationService.getSystemAgent().Agent_Id);
            return ticketId;
        }
    }
    return null;
};

// Idempotent per Message-ID; inbound and outbound (sent from Gmail) alike. Awaits stay outside the DB transaction.
const ingestMessage = async (normalized, systemAgentId, mailboxAddress, attachmentFiles = []) => {
    const org = organizationService.getDefaultOrganization();

    const alreadyIngested = threadRepository.findThreadByMessageId(normalized.messageIdHeader);
    if (alreadyIngested) {
        // Deleted in Gmail and now back out of Trash: restore the mail and its ticket, don't skip as duplicate.
        if (alreadyIngested.Is_Deleted === "Y") {
            const ticketId = restoreIngestedThread(alreadyIngested, systemAgentId);
            publish({ type: REALTIME_EVENT.TICKET_CHANGED, ticketId, reason: "restored" });
            return { status: "restored", ticketId, threadId: alreadyIngested.Thread_Id };
        }
        return {
            status: "skipped",
            reason: "already ingested",
            ticketId: alreadyIngested.Ticket_Id,
            threadId: alreadyIngested.Thread_Id
        };
    }

    if (!normalized.from?.email) {
        return { status: "skipped", reason: "message has no From address" };
    }

    const isOutbound = normalized.from.email.toLowerCase() === mailboxAddress.toLowerCase();
    const direction = isOutbound ? DIRECTION.OUT : DIRECTION.IN;

    // The counterpart (customer) is whichever side isn't the mailbox, so matching works in both directions.
    const counterpartAddress = isOutbound ? (normalized.to[0] || normalized.cc[0]) : resolveRequester(normalized, mailboxAddress);
    if (!counterpartAddress?.email) {
        return { status: "skipped", reason: "outbound message has no recipient to match a contact" };
    }
    const contact = contactService.findOrCreateBySender(counterpartAddress, systemAgentId);
    // Every From address is kept on the Customers page (bank side and our agents), not only the counterpart.
    if (normalized.from.email.toLowerCase() !== counterpartAddress.email.toLowerCase()) {
        contactService.findOrCreateBySender(normalized.from, systemAgentId);
    }

    // Outbound author is the real sending agent (found or created by From), never the system actor.
    const authorAgentId = isOutbound
        ? agentService.findOrCreateBySender(normalized.from, systemAgentId).Agent_Id
        : null;

    // A part referenced inline as cid: is body content: embed it as a data: URI (browsers can't resolve cid:).
    let resolvedBodyHtml = normalized.bodyHtml;
    const realAttachmentFiles = [];
    for (const file of attachmentFiles) {
        const cidRef = file.contentId ? `cid:${file.contentId}` : null;
        if (cidRef && resolvedBodyHtml && resolvedBodyHtml.includes(cidRef)) {
            const dataUri = `data:${file.mimeType};base64,${file.buffer.toString("base64")}`;
            resolvedBodyHtml = resolvedBodyHtml.split(cidRef).join(dataUri);
        } else {
            realAttachmentFiles.push(file);
        }
    }
    resolvedBodyHtml = await embedRemoteImages(resolvedBodyHtml);

    const db = getDB();
    const txn = db.transaction(() => {
        let ticketId = findTicketIdForReply(normalized);
        let isNewTicket = false;

        if (!ticketId) {
            const mailReplyAddress = mailReplyAddressRepository.findByEmail(mailboxAddress);
            if (!mailReplyAddress) {
                throw new ApiError(
                    HTTP_STATUS.INTERNAL_SERVER_ERROR,
                    ERROR_CODES.MAIL_REPLY_ADDRESS_NOT_FOUND,
                    `No HD_MAIL_REPLY_ADDRESS configured for ${mailboxAddress}. Run \`npm run seed\`.`
                );
            }

            const ticket = ticketService.createTicket({
                subject: normalized.subject,
                description: normalized.bodyText,
                channel: CHANNEL.EMAIL,
                status: NEW_EMAIL_TICKET_STATUS,
                departmentId: mailReplyAddress.Department_Id,
                contactId: contact.Contact_Id,
                createdTime: normalized.sentTime
            }, systemAgentId);
            ticketId = ticket.Ticket_Id;
            isNewTicket = true;
        }

        // A customer mail on a Closed ticket waits for a lead's decision (ticket-reopen.service.js).
        const closedTicket = !isNewTicket && !isOutbound && ticketRepository.findById(ticketId)?.Clock_State === CLOCK_BEHAVIOUR.STOPPED;

        const conversationId = generateId(DB_TABLES.TICKET_CONVERSATION);
        conversationRepository.insert({
            Conversation_Id: conversationId,
            Ticket_Id: ticketId,
            Direction: direction,
            Channel: CHANNEL.EMAIL,
            Subject: normalized.subject,
            Post_Close_Decision: closedTicket ? POST_CLOSE_DECISION.PENDING : null,
            Content: normalized.bodyText,
            Content_Html: resolvedBodyHtml,
            Author_Contact_Id: isOutbound ? null : contact.Contact_Id,
            Author_Agent_Id: authorAgentId,
            Is_Public: "Y",
            To_Address: normalized.to.map((a) => a.email).join(", ") || null,
            Cc_Address: normalized.cc.map((a) => a.email).join(", ") || null,
            Sent_Time: normalized.sentTime,
            Created_By: systemAgentId,
            Org_Id: org.Organization_Id
        });

        const threadId = generateId(DB_TABLES.TICKET_THREAD);
        threadRepository.insert({
            Thread_Id: threadId,
            Ticket_Id: ticketId,
            Conversation_Id: conversationId,
            Message_Id_Header: normalized.messageIdHeader,
            In_Reply_To_Header: normalized.inReplyToHeader,
            Channel: "EMAIL",
            Direction: direction,
            Created_By: systemAgentId,
            Org_Id: org.Organization_Id
        });

        ticketRepository.incrementCounter(ticketId, "Thread_Count", 1, systemAgentId);

        for (const file of realAttachmentFiles) {
            const attachmentId = generateId(DB_TABLES.TICKET_ATTACHMENT);
            const storagePath = saveAttachmentBuffer({
                ticketId,
                attachmentId,
                fileName: file.filename,
                buffer: file.buffer
            });
            attachmentRepository.insert({
                Attachment_Id: attachmentId,
                Ticket_Id: ticketId,
                Conversation_Id: conversationId,
                File_Name: file.filename,
                File_Size_Bytes: file.buffer.length,
                Mime_Type: file.mimeType,
                Storage_Path: storagePath,
                Uploaded_By_Agent_Id: systemAgentId,
                Uploaded_Time: normalized.sentTime,
                Created_By: systemAgentId,
                Org_Id: org.Organization_Id
            });
        }
        if (realAttachmentFiles.length > 0) {
            ticketRepository.incrementCounter(ticketId, "Attachment_Count", realAttachmentFiles.length, systemAgentId);
        }

        if (!isNewTicket) {
            ticketService.recordHistory({
                ticketId,
                eventName: TICKET_HISTORY_EVENT.CONVERSATION_ADDED,
                actorAgentId: systemAgentId,
                orgId: org.Organization_Id,
                eventTime: normalized.sentTime
            });
        }

        return { ticketId, threadId, isNewTicket };
    });

    const { ticketId, threadId, isNewTicket } = txn();
    // A new ticket is announced by createTicket; a mail on an existing one here.
    if (!isNewTicket) publish({ type: REALTIME_EVENT.TICKET_CONVERSATION, ticketId, reason: "email", inbound: !isOutbound });
    return { status: "ingested", ticketId, threadId, isNewTicket, attachmentsSaved: realAttachmentFiles.length };
};

/** Runs one Gmail sync pass for the configured support mailbox. */
const runSync = async ({ mailbox = env.google.mailbox } = {}) => {
    const gmail = gmailClient.getGmailClient();
    const systemAgent = organizationService.getSystemAgent();

    // Oldest-first, so a reply's parent is always ingested before it (else the reply opens its own ticket).
    const messageIds = (await listMessageIdsToProcess(gmail, gmailClient.mailboxQuery(mailbox))).reverse();
    const results = { fetched: messageIds.length, ingested: 0, skipped: 0, ticketsCreated: 0, attachmentsSaved: 0, errors: [] };

    for (const id of messageIds) {
        try {
            // Cheap local check, no API call, so a short sync interval is safe on quota; purged mail skipped too.
            if (gmailIngestedMessageRepository.isProcessed(id)) {
                results.skipped += 1;
                continue;
            }

            const raw = await getFullMessage(gmail, id);
            const normalized = normalizeMessage(raw);
            const attachmentFiles = normalized.attachments.length > 0
                ? await downloadAttachments(gmail, normalized.gmailMessageId, normalized.attachments)
                : [];
            const outcome = await ingestMessage(normalized, systemAgent.Agent_Id, mailbox, attachmentFiles);

            if (outcome.ticketId) {
                gmailIngestedMessageRepository.insert({
                    gmailMessageId: id,
                    ticketId: outcome.ticketId,
                    threadId: outcome.threadId || null
                });
            }

            if (outcome.status === "ingested") {
                results.ingested += 1;
                results.attachmentsSaved += outcome.attachmentsSaved || 0;
                if (outcome.isNewTicket) {
                    results.ticketsCreated += 1;
                }
            } else {
                results.skipped += 1;
            }

            // Throttle only after a real API fetch, not a cheap skip, so idle ticks stay instant.
            await sleep(PER_MESSAGE_DELAY_MS);
        } catch (error) {
            if (isQuotaExceededError(error)) {
                // The rest would fail too; stop and let the next tick resume once the quota window resets.
                logger.warn(
                    `Gmail sync stopped early: quota exceeded after ${results.ingested} ingested ` +
                    `(${messageIds.length - results.ingested - results.skipped} message(s) remaining this run).`
                );
                break;
            }
            logger.error(`Gmail ingestion failed for message ${id}:`, error);
            results.errors.push({ messageId: id, message: error.message });
        }
    }

    return results;
};

module.exports = { runSync, ingestMessage, embedRemoteImages };
