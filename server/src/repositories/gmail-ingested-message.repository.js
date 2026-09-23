const { getDB } = require("../config/db");

const TABLE = "_GMAIL_INGESTED_MESSAGE";

/** Cheap local lookup - no Gmail API call - used to skip already-processed message ids before fetching full content. */
const findByGmailMessageId = (gmailMessageId) => {
    const db = getDB();
    return db.prepare(`SELECT * FROM ${TABLE} WHERE Gmail_Message_Id = ?`).get(gmailMessageId);
};

const insert = ({ gmailMessageId, ticketId, threadId }) => {
    const db = getDB();
    db.prepare(
        `INSERT OR IGNORE INTO ${TABLE} (Gmail_Message_Id, Ticket_Id, Thread_Id) VALUES (?, ?, ?)`
    ).run(gmailMessageId, ticketId, threadId);
};

/** Every message this mailbox has ever ingested - used by deletion-sync to diff against Gmail's current live set. */
const findAll = () => {
    const db = getDB();
    return db.prepare(`SELECT * FROM ${TABLE}`).all();
};

const deleteByGmailMessageId = (gmailMessageId) => {
    const db = getDB();
    db.prepare(`DELETE FROM ${TABLE} WHERE Gmail_Message_Id = ?`).run(gmailMessageId);
};

module.exports = { findByGmailMessageId, insert, findAll, deleteByGmailMessageId };
