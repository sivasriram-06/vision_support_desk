const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { TICKET_ESCALATION_COLUMNS } = require("../models/escalation.model");

const base = createRepository({
    table: DB_TABLES.TICKET_ESCALATION,
    primaryKey: "Ticket_Escalation_Id",
    columns: TICKET_ESCALATION_COLUMNS
});

const findByTicketId = (ticketId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.TICKET_ESCALATION} WHERE Ticket_Id = ? ORDER BY Level_No ASC`
    ).all(ticketId);
};

/** Trigger rows are derived data, so they're replaced outright rather than soft-deleted. */
const deleteByTicketId = (ticketId) => {
    const db = getDB();
    db.prepare(`DELETE FROM ${DB_TABLES.TICKET_ESCALATION} WHERE Ticket_Id = ?`).run(ticketId);
};

module.exports = { ...base, findByTicketId, deleteByTicketId };
