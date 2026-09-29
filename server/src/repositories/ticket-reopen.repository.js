const { getDB } = require("../config/db");
const DB_TABLES = require("../constants/db-tables");

// HD_TICKET_REOPEN is append-only apart from Closed_Again_Time, so it
// doesn't use the base repository's CRUD helpers.

const insert = (row) => {
    const db = getDB();
    db.prepare(
        `INSERT INTO ${DB_TABLES.TICKET_REOPEN}
            (Reopen_Id, Ticket_Id, Reopen_No, Reason, Trigger_Conversation_Id, Reopened_By, Reopened_Time,
             Prev_Closed_Time, Prev_Due_Date, Prev_Sla_Met, Org_Id)
         VALUES (@Reopen_Id, @Ticket_Id, @Reopen_No, @Reason, @Trigger_Conversation_Id, @Reopened_By, @Reopened_Time,
             @Prev_Closed_Time, @Prev_Due_Date, @Prev_Sla_Met, @Org_Id)`
    ).run(row);
};

const countByTicketId = (ticketId) => {
    const db = getDB();
    return db.prepare(`SELECT COUNT(*) AS n FROM ${DB_TABLES.TICKET_REOPEN} WHERE Ticket_Id = ?`).get(ticketId).n;
};

/** Every reopen of a ticket, oldest first, with who reopened it. */
const findByTicketId = (ticketId) => {
    const db = getDB();
    return db.prepare(
        `SELECT r.*, a.First_Name AS Reopened_By_First_Name, a.Last_Name AS Reopened_By_Last_Name
         FROM ${DB_TABLES.TICKET_REOPEN} r
         LEFT JOIN ${DB_TABLES.AGENT} a ON a.Agent_Id = r.Reopened_By
         WHERE r.Ticket_Id = ?
         ORDER BY r.Reopen_No ASC`
    ).all(ticketId);
};

/** The latest reopened round of a ticket ends when it closes again. */
const markClosedAgain = (ticketId, closedTime) => {
    const db = getDB();
    db.prepare(
        `UPDATE ${DB_TABLES.TICKET_REOPEN} SET Closed_Again_Time = ?
         WHERE Ticket_Id = ? AND Closed_Again_Time IS NULL
           AND Reopen_No = (SELECT MAX(Reopen_No) FROM ${DB_TABLES.TICKET_REOPEN} WHERE Ticket_Id = ?)`
    ).run(closedTime, ticketId, ticketId);
};

module.exports = { insert, countByTicketId, findByTicketId, markClosedAgain };
