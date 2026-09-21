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

const findByTicketId = (ticketId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.TICKET_CONVERSATION} WHERE Ticket_Id = ? AND Is_Deleted = 'N' ORDER BY Sent_Time ASC`
    ).all(ticketId);
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
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.TICKET_COMMENT} WHERE Ticket_Id = ? AND Is_Deleted = 'N' ORDER BY Commented_Time ASC`
    ).all(ticketId);
};

module.exports = {
    conversation: { ...conversationBase, findByTicketId },
    thread: { ...threadBase, findThreadByMessageId, findThreadByInReplyTo },
    comment: { ...commentBase, findCommentsByTicketId }
};
