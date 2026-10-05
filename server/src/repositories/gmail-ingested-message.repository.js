const { getDB } = require("../config/db");
const { nowIst } = require("../utils/time");

const TABLE = "_GMAIL_INGESTED_MESSAGE";
const PURGED_TABLE = "_GMAIL_PURGED_MESSAGE";

/** Cheap local lookup - no Gmail API call - used to skip already-processed message ids before fetching full content. */
const findByGmailMessageId = (gmailMessageId) => {
    const db = getDB();
    return db.prepare(`SELECT * FROM ${TABLE} WHERE Gmail_Message_Id = ?`).get(gmailMessageId);
};

const insert = ({ gmailMessageId, ticketId, threadId }) => {
    const db = getDB();
    db.prepare(
        `INSERT OR IGNORE INTO ${TABLE} (Gmail_Message_Id, Ticket_Id, Thread_Id, Created_Time) VALUES (?, ?, ?, ?)`
    ).run(gmailMessageId, ticketId, threadId, nowIst());
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

/**
 * Already handled - ingested, or its ticket was permanently deleted from
 * the recycle bin (_GMAIL_PURGED_MESSAGE). Either way the sync skips it.
 */
const isProcessed = (gmailMessageId) => {
    const db = getDB();
    return Boolean(
        db.prepare(`SELECT 1 FROM ${TABLE} WHERE Gmail_Message_Id = ?`).get(gmailMessageId)
        || db.prepare(`SELECT 1 FROM ${PURGED_TABLE} WHERE Gmail_Message_Id = ?`).get(gmailMessageId)
    );
};

/**
 * Moves a purged ticket's message ids from the ingested list to the purged
 * list, so the mails (still in Gmail) are never imported again. Run inside
 * the purge transaction, before the ticket's rows are removed.
 */
const markTicketPurged = (ticketId, ticketNumber) => {
    const db = getDB();
    db.prepare(
        `INSERT OR IGNORE INTO ${PURGED_TABLE} (Gmail_Message_Id, Ticket_Number, Purged_Time)
         SELECT Gmail_Message_Id, ?, ? FROM ${TABLE} WHERE Ticket_Id = ?`
    ).run(ticketNumber, nowIst(), ticketId);
    db.prepare(`DELETE FROM ${TABLE} WHERE Ticket_Id = ?`).run(ticketId);
};

module.exports = { findByGmailMessageId, insert, findAll, deleteByGmailMessageId, isProcessed, markTicketPurged };
