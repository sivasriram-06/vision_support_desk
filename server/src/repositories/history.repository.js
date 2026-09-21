const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { TICKET_HISTORY_COLUMNS, TICKET_RESOLUTION_COLUMNS, TICKET_METRICS_COLUMNS } = require("../models/ticket.model");

const historyBase = createRepository({
    table: DB_TABLES.TICKET_HISTORY,
    primaryKey: "History_Id",
    columns: TICKET_HISTORY_COLUMNS
});

const findByTicketId = (ticketId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.TICKET_HISTORY} WHERE Ticket_Id = ? AND Is_Deleted = 'N' ORDER BY Event_Time ASC`
    ).all(ticketId);
};

const resolutionBase = createRepository({
    table: DB_TABLES.TICKET_RESOLUTION,
    primaryKey: "Resolution_Id",
    columns: TICKET_RESOLUTION_COLUMNS
});

const findResolutionByTicketId = (ticketId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.TICKET_RESOLUTION} WHERE Ticket_Id = ? AND Is_Deleted = 'N' ORDER BY Created_Time DESC LIMIT 1`
    ).get(ticketId);
};

const metricsBase = createRepository({
    table: DB_TABLES.TICKET_METRICS,
    primaryKey: "Metric_Id",
    columns: TICKET_METRICS_COLUMNS
});

const findMetricsByTicketId = (ticketId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.TICKET_METRICS} WHERE Ticket_Id = ? AND Is_Deleted = 'N'`
    ).get(ticketId);
};

module.exports = {
    history: { ...historyBase, findByTicketId },
    resolution: { ...resolutionBase, findResolutionByTicketId },
    metrics: { ...metricsBase, findMetricsByTicketId }
};
