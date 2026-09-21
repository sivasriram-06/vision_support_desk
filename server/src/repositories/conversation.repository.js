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

module.exports = {
    conversation: { ...conversationBase, findByTicketId },
    thread: { ...threadBase, findThreadByMessageId, findThreadByInReplyTo },
    comment: { ...commentBase, findCommentsByTicketId }
};
