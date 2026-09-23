const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { TICKET_ATTACHMENT_COLUMNS } = require("../models/ticket.model");

const base = createRepository({
    table: DB_TABLES.TICKET_ATTACHMENT,
    primaryKey: "Attachment_Id",
    columns: TICKET_ATTACHMENT_COLUMNS
});

const findByTicketId = (ticketId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.TICKET_ATTACHMENT} WHERE Ticket_Id = ? AND Is_Deleted = 'N' ORDER BY Uploaded_Time ASC`
    ).all(ticketId);
};

const findByConversationId = (conversationId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.TICKET_ATTACHMENT} WHERE Conversation_Id = ? AND Is_Deleted = 'N'`
    ).all(conversationId);
};

module.exports = { ...base, findByTicketId, findByConversationId };
