const { getDB } = require("../../config/db");
const env = require("../../config/env");
const gmailClient = require("./gmail.client");
const { thread: threadRepository, conversation: conversationRepository } = require("../../repositories/conversation.repository");
const ticketRepository = require("../../repositories/ticket.repository");
const attachmentRepository = require("../../repositories/attachment.repository");
const gmailIngestedMessageRepository = require("../../repositories/gmail-ingested-message.repository");
const organizationService = require("../../services/organization.service");
const logger = require("../../utils/logger");

/**
 * Walks EVERY message id currently matching the ingestion query, with no
 * early-stop. Unlike the main sync's listMessageIdsToProcess (which can
 * safely stop once it hits a page of already-known messages), deletion
 * detection needs the full live set to diff against - stopping early would
 * make everything past that point look "deleted" even though it's simply
 * unread by this walk.
 */
const listAllLiveMessageIds = async (gmail, query) => {
    const ids = new Set();
    let pageToken;
    do {
        const res = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 100, pageToken });
        for (const message of res.data.messages || []) {
            ids.add(message.id);
        }
        pageToken = res.data.nextPageToken;
    } while (pageToken);
    return ids;
};

/**
 * Removes one already-ingested message's local footprint: its thread row,
 * its conversation row (and any attachments on that conversation), with
 * the ticket's counters adjusted to match. If that was the ticket's last
 * remaining (non-deleted) conversation, the ticket itself is removed too -
 * this mailbox is its only source of truth, so a ticket with nothing left
 * in it has nothing left to show.
 */
const removeIngestedMessage = (row, actorAgentId) => {
    const db = getDB();
    const txn = db.transaction(() => {
        const thread = row.Thread_Id ? threadRepository.findById(row.Thread_Id) : null;

        if (thread) {
            threadRepository.softDeleteById(thread.Thread_Id, actorAgentId);

            const conversation = conversationRepository.findById(thread.Conversation_Id);
            if (conversation) {
                conversationRepository.softDeleteById(conversation.Conversation_Id, actorAgentId);
                ticketRepository.incrementCounter(row.Ticket_Id, "Thread_Count", -1);

                const attachments = attachmentRepository.findByConversationId(conversation.Conversation_Id);
                for (const attachment of attachments) {
                    attachmentRepository.softDeleteById(attachment.Attachment_Id, actorAgentId);
                }
                if (attachments.length > 0) {
                    ticketRepository.incrementCounter(row.Ticket_Id, "Attachment_Count", -attachments.length);
                }
            }
        }

        gmailIngestedMessageRepository.deleteByGmailMessageId(row.Gmail_Message_Id);

        const remainingConversations = conversationRepository.findByTicketId(row.Ticket_Id);
        let ticketRemoved = false;
        if (remainingConversations.length === 0) {
            ticketRepository.softDeleteById(row.Ticket_Id, actorAgentId);
            ticketRemoved = true;
        }

        return { ticketRemoved };
    });

    return txn();
};

/**
 * Detects messages this app previously ingested that no longer exist in
 * Gmail (deleted by the mailbox owner) and removes them locally to match -
 * this app mirrors the mailbox rather than archiving independently of it.
 * Only ever calls messages.list (cheap, no per-message content fetch), so
 * it's safe to run far more often than it needs to without meaningfully
 * touching Gmail API quota.
 */
const runDeletionSync = async ({ mailbox = env.google.mailbox } = {}) => {
    const gmail = gmailClient.getGmailClient();
    const systemAgent = organizationService.getSystemAgent();

    const liveIds = await listAllLiveMessageIds(gmail, `{to:${mailbox} from:${mailbox}}`);
    const ingestedRows = gmailIngestedMessageRepository.findAll();

    const results = { checked: ingestedRows.length, removed: 0, ticketsRemoved: 0, errors: [] };

    for (const row of ingestedRows) {
        if (liveIds.has(row.Gmail_Message_Id)) {
            continue;
        }
        try {
            const { ticketRemoved } = removeIngestedMessage(row, systemAgent.Agent_Id);
            results.removed += 1;
            if (ticketRemoved) {
                results.ticketsRemoved += 1;
            }
        } catch (error) {
            logger.error(`Deletion-sync failed for Gmail message ${row.Gmail_Message_Id}:`, error);
            results.errors.push({ gmailMessageId: row.Gmail_Message_Id, message: error.message });
        }
    }

    return results;
};

module.exports = { runDeletionSync };
