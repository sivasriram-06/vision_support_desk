const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { TICKET_CLOCK_SEGMENT_COLUMNS } = require("../models/ticket.model");

const base = createRepository({
    table: DB_TABLES.TICKET_CLOCK_SEGMENT,
    primaryKey: "Segment_Id",
    columns: TICKET_CLOCK_SEGMENT_COLUMNS
});

const findByTicketId = (ticketId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.TICKET_CLOCK_SEGMENT} WHERE Ticket_Id = ? AND Is_Deleted = 'N' ORDER BY Started_Time ASC`
    ).all(ticketId);
};

const findOpenByTicketId = (ticketId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.TICKET_CLOCK_SEGMENT} WHERE Ticket_Id = ? AND Ended_Time IS NULL AND Is_Deleted = 'N'`
    ).get(ticketId);
};

module.exports = { ...base, findByTicketId, findOpenByTicketId };
