const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const {
    TICKET_CONVERSATION_COLUMNS,
    TICKET_THREAD_COLUMNS,
    TICKET_COMMENT_COLUMNS
} = require("../models/ticket.model");

const conversationBase = createRepository({
    table: DB_TABLES.TICKET_CONVERSATION,
    primaryKey: "Conversation_Id",
    columns: TICKET_CONVERSATION_COLUMNS
});

/**
 * Joins in the ACTUAL author of each message (contact for inbound, agent
 * for outbound) rather than leaving callers to assume every inbound message
 * in a thread came from the ticket's single primary Contact_Id - a thread
 * can (and often does) have multiple different people replying.
 */
const findByTicketId = (ticketId) => {
    const db = getDB();
    return db.prepare(`
        SELECT conv.*,
            c.First_Name AS Author_Contact_First_Name, c.Last_Name AS Author_Contact_Last_Name, c.Email AS Author_Contact_Email,
            a.First_Name AS Author_Agent_First_Name, a.Last_Name AS Author_Agent_Last_Name
        FROM ${DB_TABLES.TICKET_CONVERSATION} conv
        LEFT JOIN ${DB_TABLES.CONTACT} c ON c.Contact_Id = conv.Author_Contact_Id
        LEFT JOIN ${DB_TABLES.AGENT} a ON a.Agent_Id = conv.Author_Agent_Id
        WHERE conv.Ticket_Id = ? AND conv.Is_Deleted = 'N'
        ORDER BY conv.Sent_Time ASC
    `).all(ticketId);
};

const threadBase = createRepository({
    table: DB_TABLES.TICKET_THREAD,
    primaryKey: "Thread_Id",
    columns: TICKET_THREAD_COLUMNS
});

const findThreadByMessageId = (messageIdHeader) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.TICKET_THREAD} WHERE Message_Id_Header = ?`
    ).get(messageIdHeader);
};

const findThreadByInReplyTo = (inReplyToHeader) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.TICKET_THREAD} WHERE Message_Id_Header = ? AND Is_Deleted = 'N'`
    ).get(inReplyToHeader);
};

const commentBase = createRepository({
    table: DB_TABLES.TICKET_COMMENT,
    primaryKey: "Comment_Id",
    columns: TICKET_COMMENT_COLUMNS
});

const findCommentsByTicketId = (ticketId) => {
    const db = getDB();
    return db.prepare(`
        SELECT cm.*, a.First_Name AS Commenter_First_Name, a.Last_Name AS Commenter_Last_Name
        FROM ${DB_TABLES.TICKET_COMMENT} cm
        LEFT JOIN ${DB_TABLES.AGENT} a ON a.Agent_Id = cm.Commenter_Agent_Id
        WHERE cm.Ticket_Id = ? AND cm.Is_Deleted = 'N'
        ORDER BY cm.Commented_Time ASC
    `).all(ticketId);
};

/** Customer mails on a Closed ticket still waiting for a decision, oldest first. */
const findPendingCloseReplies = (ticketId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.TICKET_CONVERSATION}
         WHERE Ticket_Id = ? AND Post_Close_Decision = 'PENDING' AND Is_Deleted = 'N'
         ORDER BY Sent_Time ASC`
    ).all(ticketId);
};

/** Sets the decision on every pending reply of a ticket; returns how many changed. */
const decidePendingCloseReplies = (ticketId, decision, actorAgentId) => {
    const db = getDB();
    return db.prepare(
        `UPDATE ${DB_TABLES.TICKET_CONVERSATION} SET Post_Close_Decision = ?, Modified_By = ?, Modified_Time = strftime('%Y-%m-%dT%H:%M:%f+05:30', 'now', '+330 minutes')
         WHERE Ticket_Id = ? AND Post_Close_Decision = 'PENDING'`
    ).run(decision, actorAgentId, ticketId).changes;
};

/**
 * "Create as new issue": moves the mails from `fromTime` on (the first
 * pending reply and everything after it) with their threads and
 * attachments to `toTicketId`. Returns { conversations, threads, attachments }
 * moved, for the tickets' counters.
 */
const moveFromTime = (fromTicketId, toTicketId, fromTime, actorAgentId) => {
    const db = getDB();
    const ids = db.prepare(
        `SELECT Conversation_Id FROM ${DB_TABLES.TICKET_CONVERSATION}
         WHERE Ticket_Id = ? AND Sent_Time >= ? AND Is_Deleted = 'N'`
    ).all(fromTicketId, fromTime).map((r) => r.Conversation_Id);
    if (ids.length === 0) return { conversations: 0, threads: 0, attachments: 0 };
    const inList = ids.map(() => "?").join(", ");
    const conversations = db.prepare(
        `UPDATE ${DB_TABLES.TICKET_CONVERSATION} SET Ticket_Id = ?, Modified_By = ?, Modified_Time = strftime('%Y-%m-%dT%H:%M:%f+05:30', 'now', '+330 minutes') WHERE Conversation_Id IN (${inList})`
    ).run(toTicketId, actorAgentId, ...ids).changes;
    const threads = db.prepare(
        `UPDATE ${DB_TABLES.TICKET_THREAD} SET Ticket_Id = ?, Modified_By = ?, Modified_Time = strftime('%Y-%m-%dT%H:%M:%f+05:30', 'now', '+330 minutes') WHERE Conversation_Id IN (${inList})`
    ).run(toTicketId, actorAgentId, ...ids).changes;
    const attachments = db.prepare(
        `UPDATE ${DB_TABLES.TICKET_ATTACHMENT} SET Ticket_Id = ?, Modified_By = ?, Modified_Time = strftime('%Y-%m-%dT%H:%M:%f+05:30', 'now', '+330 minutes') WHERE Conversation_Id IN (${inList}) AND Is_Deleted = 'N'`
    ).run(toTicketId, actorAgentId, ...ids).changes;
    // The Gmail sync's own record of each mail follows it too.
    db.prepare(
        `UPDATE _GMAIL_INGESTED_MESSAGE SET Ticket_Id = ?
         WHERE Thread_Id IN (SELECT Thread_Id FROM ${DB_TABLES.TICKET_THREAD} WHERE Conversation_Id IN (${inList}))`
    ).run(toTicketId, ...ids);
    return { conversations, threads, attachments };
};

module.exports = {
    conversation: { ...conversationBase, findByTicketId, findPendingCloseReplies, decidePendingCloseReplies, moveFromTime },
    thread: { ...threadBase, findThreadByMessageId, findThreadByInReplyTo },
    comment: { ...commentBase, findCommentsByTicketId }
};
