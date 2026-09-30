const { getDB } = require("../../config/db");
const env = require("../../config/env");
const gmailClient = require("./gmail.client");
const { thread: threadRepository, conversation: conversationRepository } = require("../../repositories/conversation.repository");
const ticketRepository = require("../../repositories/ticket.repository");
const attachmentRepository = require("../../repositories/attachment.repository");
const gmailIngestedMessageRepository = require("../../repositories/gmail-ingested-message.repository");
const organizationService = require("../../services/organization.service");
const DB_TABLES = require("../../constants/db-tables");
const { publish, REALTIME_EVENT } = require("../../realtime/bus");
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
        // The thread row knows the ticket the mail is on NOW - a "Create as
        // new issue" split moves mails, so the ingested row's Ticket_Id can
        // be stale.
        const thread = row.Thread_Id ? threadRepository.findById(row.Thread_Id, { includeDeleted: true }) : null;
        const ticketId = thread ? thread.Ticket_Id : row.Ticket_Id;

        if (thread && thread.Is_Deleted === "N") {
            threadRepository.softDeleteById(thread.Thread_Id, actorAgentId);
            const conversation = conversationRepository.findById(thread.Conversation_Id);
            if (conversation) {
                conversationRepository.softDeleteById(conversation.Conversation_Id, actorAgentId);
                for (const attachment of attachmentRepository.findByConversationId(conversation.Conversation_Id)) {
                    attachmentRepository.softDeleteById(attachment.Attachment_Id, actorAgentId);
                }
            }
        }

        gmailIngestedMessageRepository.deleteByGmailMessageId(row.Gmail_Message_Id);
        recountTicket(ticketId);

        const remainingConversations = conversationRepository.findByTicketId(ticketId);
        let ticketRemoved = false;
        if (remainingConversations.length === 0) {
            ticketRepository.softDeleteById(ticketId, actorAgentId);
            ticketRemoved = true;
        }

        return { ticketRemoved, ticketId };
    });

    return txn();
};

/**
 * Thread / attachment counters from the rows themselves, so a delete and a
 * later restore (or a split moving mails) can never drift them negative.
 */
const recountTicket = (ticketId) => {
    getDB().prepare(
        `UPDATE ${DB_TABLES.TICKET} SET
            Thread_Count = (SELECT COUNT(*) FROM ${DB_TABLES.TICKET_THREAD} WHERE Ticket_Id = @ticketId AND Is_Deleted = 'N'),
            Attachment_Count = (SELECT COUNT(*) FROM ${DB_TABLES.TICKET_ATTACHMENT} WHERE Ticket_Id = @ticketId AND Is_Deleted = 'N')
         WHERE Ticket_Id = @ticketId`
    ).run({ ticketId });
};

/**
 * A mail the owner deleted in Gmail came back (moved out of Trash): brings
 * back its thread, conversation and attachments - and the ticket, if the
 * delete had removed it. Returns the ticket id the mail is on. Runs in the
 * caller's transaction when there is one.
 */
const restoreIngestedThread = (thread, actorAgentId) => {
    const db = getDB();
    return db.transaction(() => {
        const undelete = (table, key, id) =>
            db.prepare(`UPDATE ${table} SET Is_Deleted = 'N', Modified_By = ?, Modified_Time = strftime('%Y-%m-%dT%H:%M:%f+05:30', 'now', '+330 minutes') WHERE ${key} = ?`).run(actorAgentId, id);
        undelete(DB_TABLES.TICKET_THREAD, "Thread_Id", thread.Thread_Id);
        if (thread.Conversation_Id) {
            undelete(DB_TABLES.TICKET_CONVERSATION, "Conversation_Id", thread.Conversation_Id);
            db.prepare(
                `UPDATE ${DB_TABLES.TICKET_ATTACHMENT} SET Is_Deleted = 'N', Modified_By = ?, Modified_Time = strftime('%Y-%m-%dT%H:%M:%f+05:30', 'now', '+330 minutes') WHERE Conversation_Id = ?`
            ).run(actorAgentId, thread.Conversation_Id);
        }
        // Only a ticket the Gmail delete removed comes back - not one a person deleted.
        const deletedByUser = db.prepare(
            `SELECT 1 FROM ${DB_TABLES.TICKET_HISTORY} WHERE Ticket_Id = ? AND Event_Name = 'TICKET_DELETED' LIMIT 1`
        ).get(thread.Ticket_Id);
        if (!deletedByUser) undelete(DB_TABLES.TICKET, "Ticket_Id", thread.Ticket_Id);
        recountTicket(thread.Ticket_Id);
        return thread.Ticket_Id;
    })();
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

    const results = { checked: ingestedRows.length, removed: 0, ticketsRemoved: 0, restored: 0, errors: [] };

    for (const row of ingestedRows) {
        if (liveIds.has(row.Gmail_Message_Id)) {
            // Live in Gmail but deleted here: it was deleted and then moved
            // back out of Trash - bring it back.
            const thread = row.Thread_Id ? threadRepository.findById(row.Thread_Id, { includeDeleted: true }) : null;
            if (thread && thread.Is_Deleted === "Y") {
                try {
                    const ticketId = restoreIngestedThread(thread, systemAgent.Agent_Id);
                    publish({ type: REALTIME_EVENT.TICKET_CHANGED, ticketId, reason: "restored" });
                    results.restored += 1;
                } catch (error) {
                    logger.error(`Restore failed for Gmail message ${row.Gmail_Message_Id}:`, error);
                    results.errors.push({ gmailMessageId: row.Gmail_Message_Id, message: error.message });
                }
            }
            continue;
        }
        try {
            const { ticketRemoved, ticketId } = removeIngestedMessage(row, systemAgent.Agent_Id);
            publish({ type: ticketRemoved ? REALTIME_EVENT.TICKET_DELETED : REALTIME_EVENT.TICKET_CHANGED, ticketId, reason: "mail-deleted" });
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

module.exports = { runDeletionSync, restoreIngestedThread, recountTicket };
