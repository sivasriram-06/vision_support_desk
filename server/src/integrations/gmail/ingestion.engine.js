const { getDB } = require("../../config/db");
const env = require("../../config/env");
const gmailClient = require("./gmail.client");
const { normalizeMessage } = require("./gmail.normalizer");
const { thread: threadRepository, conversation: conversationRepository } = require("../../repositories/conversation.repository");
const ticketRepository = require("../../repositories/ticket.repository");
const { mailReplyAddress: mailReplyAddressRepository } = require("../../repositories/channel.repository");
const gmailIngestedMessageRepository = require("../../repositories/gmail-ingested-message.repository");
const attachmentRepository = require("../../repositories/attachment.repository");
const ticketService = require("../../services/ticket.service");
const contactService = require("../../services/contact.service");
const organizationService = require("../../services/organization.service");
const generateId = require("../../utils/generate-id");
const { saveAttachmentBuffer } = require("../../utils/file-storage");
const logger = require("../../utils/logger");
const ApiError = require("../../utils/api-error");
const ERROR_CODES = require("../../constants/error-codes");
const HTTP_STATUS = require("../../constants/http-status");
const { CHANNEL, DIRECTION, TICKET_HISTORY_EVENT } = require("../../constants/ticket.constants");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Gap between each message's full-fetch (+ any attachment downloads) within
// one sync run, so a big backfill spreads its Gmail API calls out instead of
// bursting them and tripping the per-minute quota (see runSync's early-exit
// below for what happens if it trips anyway).
const PER_MESSAGE_DELAY_MS = 350;

const isQuotaExceededError = (error) => error?.code === 403 && error?.errors?.[0]?.reason === "rateLimitExceeded";

const PAGE_SIZE = 50;
// Safety cap so a mailbox with years of history backfills over a few sync
// ticks instead of one run trying to walk the entire mailbox at once.
const MAX_PAGES_PER_SYNC = 20;

/**
 * Walks Gmail's message list (newest-first) page by page instead of only
 * ever reading the first page. Without this, ingestion could only ever see
 * the newest PAGE_SIZE messages matching the query - anything older than
 * that window would be permanently invisible, no matter how many sync ticks
 * ran, since every tick re-requested the same "first page".
 * Stops early once an entire page comes back with nothing new (we've
 * caught up to already-ingested history), so steady-state ticks stay cheap.
 */
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

        const hasNewOnThisPage = pageMessages.some((m) => !gmailIngestedMessageRepository.findByGmailMessageId(m.id));
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

/**
 * Resolves the actual bytes for each attachment part found by the
 * normalizer: large attachments only carry an attachmentId and need a
 * separate fetch, small ones may already have inline base64url data.
 * Runs before the sync transaction since it's async I/O.
 */
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
            buffer: Buffer.from(base64Data, "base64")
        });
    }
    return files;
};

/** Matches a reply to its parent ticket via In-Reply-To / References headers. */
const findTicketIdForReply = (normalized) => {
    const references = normalized.referencesHeader
        ? normalized.referencesHeader.split(/\s+/).filter(Boolean)
        : [];
    const candidates = [normalized.inReplyToHeader, ...references].filter(Boolean);

    for (const messageId of candidates) {
        const thread = threadRepository.findThreadByInReplyTo(messageId);
        if (thread) {
            return thread.Ticket_Id;
        }
    }
    return null;
};

/**
 * Fetch -> normalize -> idempotency check -> contact match/create ->
 * ticket match/create -> conversation + thread + attachments, all in one
 * DB transaction. Re-processing the same Gmail message is a safe no-op
 * (matches HD_TICKET_THREAD.Message_Id_Header's unique index).
 * `attachmentFiles` must already be downloaded (see downloadAttachments) -
 * this function stays synchronous so it can run inside a better-sqlite3
 * transaction.
 */
const ingestMessage = (normalized, systemAgentId, mailboxAddress, attachmentFiles = []) => {
    const org = organizationService.getDefaultOrganization();

    const alreadyIngested = threadRepository.findThreadByMessageId(normalized.messageIdHeader);
    if (alreadyIngested) {
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

    const contact = contactService.findOrCreateBySender(normalized.from, systemAgentId);

    const db = getDB();
    const txn = db.transaction(() => {
        let ticketId = findTicketIdForReply(normalized);
        let isNewTicket = false;

        if (!ticketId) {
            const mailReplyAddress = mailReplyAddressRepository.findMailReplyAddressByEmail(mailboxAddress);
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
                departmentId: mailReplyAddress.Department_Id,
                contactId: contact.Contact_Id
            }, systemAgentId);
            ticketId = ticket.Ticket_Id;
            isNewTicket = true;
        }

        const conversationId = generateId();
        conversationRepository.insert({
            Conversation_Id: conversationId,
            Ticket_Id: ticketId,
            Direction: DIRECTION.IN,
            Channel: CHANNEL.EMAIL,
            Content: normalized.bodyText,
            Content_Html: normalized.bodyHtml,
            Author_Contact_Id: contact.Contact_Id,
            Is_Public: "Y",
            To_Address: normalized.to.map((a) => a.email).join(", ") || null,
            Cc_Address: normalized.cc.map((a) => a.email).join(", ") || null,
            Sent_Time: normalized.sentTime,
            Created_By: systemAgentId,
            Org_Id: org.Organization_Id
        });

        const threadId = generateId();
        threadRepository.insert({
            Thread_Id: threadId,
            Ticket_Id: ticketId,
            Conversation_Id: conversationId,
            Message_Id_Header: normalized.messageIdHeader,
            In_Reply_To_Header: normalized.inReplyToHeader,
            Channel: "EMAIL",
            Direction: DIRECTION.IN,
            Created_By: systemAgentId,
            Org_Id: org.Organization_Id
        });

        ticketRepository.incrementCounter(ticketId, "Thread_Count");

        for (const file of attachmentFiles) {
            const attachmentId = generateId();
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
        if (attachmentFiles.length > 0) {
            ticketRepository.incrementCounter(ticketId, "Attachment_Count", attachmentFiles.length);
        }

        if (!isNewTicket) {
            ticketService.recordHistory({
                ticketId,
                eventName: TICKET_HISTORY_EVENT.CONVERSATION_ADDED,
                actorAgentId: systemAgentId,
                orgId: org.Organization_Id
            });
        }

        return { ticketId, threadId, isNewTicket };
    });

    const { ticketId, threadId, isNewTicket } = txn();
    return { status: "ingested", ticketId, threadId, isNewTicket };
};

/** Runs one Gmail sync pass for the configured support mailbox. */
const runSync = async ({ mailbox = env.google.mailbox } = {}) => {
    const gmail = gmailClient.getGmailClient();
    const systemAgent = organizationService.getSystemAgent();

    // listMessageIdsToProcess returns newest-first (Gmail's default list
    // order). Ingesting in THAT order was the bug: a reply would be seen
    // before the original message it replies to, so no matching thread
    // existed yet and the reply span up its own separate ticket instead of
    // attaching to the parent. Reversing to oldest-first guarantees a
    // message's parent is always ingested before it, within a run.
    const messageIds = (await listMessageIdsToProcess(gmail, `to:${mailbox}`)).reverse();
    const results = { fetched: messageIds.length, ingested: 0, skipped: 0, ticketsCreated: 0, attachmentsSaved: 0, errors: [] };

    for (const id of messageIds) {
        try {
            // Cheap local check first - no Gmail API call - so a message
            // we've already processed costs nothing on repeat ticks. This
            // is what makes a short GMAIL_SYNC_INTERVAL_MS safe on quota.
            if (gmailIngestedMessageRepository.findByGmailMessageId(id)) {
                results.skipped += 1;
                continue;
            }

            const raw = await getFullMessage(gmail, id);
            const normalized = normalizeMessage(raw);
            const attachmentFiles = normalized.attachments.length > 0
                ? await downloadAttachments(gmail, normalized.gmailMessageId, normalized.attachments)
                : [];
            const outcome = ingestMessage(normalized, systemAgent.Agent_Id, mailbox, attachmentFiles);

            if (outcome.ticketId) {
                gmailIngestedMessageRepository.insert({
                    gmailMessageId: id,
                    ticketId: outcome.ticketId,
                    threadId: outcome.threadId || null
                });
            }

            if (outcome.status === "ingested") {
                results.ingested += 1;
                results.attachmentsSaved += attachmentFiles.length;
                if (outcome.isNewTicket) {
                    results.ticketsCreated += 1;
                }
            } else {
                results.skipped += 1;
            }

            // Throttle: only after an actual API-consuming fetch, not after
            // a cheap skip, so idle ticks stay instant.
            await sleep(PER_MESSAGE_DELAY_MS);
        } catch (error) {
            if (isQuotaExceededError(error)) {
                // Every remaining message would fail the same way right now -
                // stop burning through the list and let the next sync tick
                // (or the next backfill page) pick up where this left off,
                // once Gmail's per-minute quota window resets.
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

module.exports = { runSync, ingestMessage };
