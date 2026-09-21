const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { TICKET_COLUMNS } = require("../models/ticket.model");
const { parsePagination } = require("../utils/pagination");

const base = createRepository({
    table: DB_TABLES.TICKET,
    primaryKey: "Ticket_Id",
    columns: TICKET_COLUMNS
});

const SORTABLE_FIELDS = new Set([
    "Created_Time", "Modified_Time", "Due_Date", "Priority", "Status", "Subject"
]);

/**
 * All Cases: paginated ticket list with filters/search/sort, per
 * GET /api/v1/tickets.
 */
const findAll = (orgId, query = {}) => {
    const db = getDB();
    const { limit, offset, page } = parsePagination(query);
    const params = [orgId];
    let where = "Org_Id = ? AND Is_Deleted = 'N'";

    if (query.status) {
        where += " AND Status = ?";
        params.push(query.status);
    }
    if (query.statusType) {
        where += " AND Status_Type = ?";
        params.push(query.statusType);
    }
    if (query.priority) {
        where += " AND Priority = ?";
        params.push(query.priority);
    }
    if (query.departmentId) {
        where += " AND Department_Id = ?";
        params.push(query.departmentId);
    }
    if (query.teamId) {
        where += " AND Team_Id = ?";
        params.push(query.teamId);
    }
    if (query.assigneeId) {
        where += " AND Assignee_Id = ?";
        params.push(query.assigneeId);
    }
    if (query.contactId) {
        where += " AND Contact_Id = ?";
        params.push(query.contactId);
    }
    if (query.search) {
        where += " AND (Subject LIKE ? OR Ticket_Number LIKE ?)";
        const term = `%${query.search}%`;
        params.push(term, term);
    }

    const sortBy = SORTABLE_FIELDS.has(query.sortBy) ? query.sortBy : "Created_Time";
    const sortOrder = String(query.sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";

    const rows = db.prepare(
        `SELECT * FROM ${DB_TABLES.TICKET} WHERE ${where} ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    const total = db.prepare(
        `SELECT COUNT(*) AS total FROM ${DB_TABLES.TICKET} WHERE ${where}`
    ).get(...params).total;

    return { rows, total, page, limit };
};

/** Agent Queue: tickets currently assigned to one agent. */
const findAgentQueue = (orgId, agentId, query = {}) => {
    return findAll(orgId, { ...query, assigneeId: agentId });
};

/** Team Queue: tickets assigned to a team, optionally unassigned-only. */
const findTeamQueue = (orgId, teamId, query = {}) => {
    const db = getDB();
    const { limit, offset, page } = parsePagination(query);
    const params = [orgId, teamId];
    let where = "Org_Id = ? AND Team_Id = ? AND Is_Deleted = 'N'";

    if (query.unassignedOnly === "true" || query.unassignedOnly === true) {
        where += " AND Assignee_Id IS NULL";
    }

    const rows = db.prepare(
        `SELECT * FROM ${DB_TABLES.TICKET} WHERE ${where} ORDER BY Created_Time DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    const total = db.prepare(
        `SELECT COUNT(*) AS total FROM ${DB_TABLES.TICKET} WHERE ${where}`
    ).get(...params).total;

    return { rows, total, page, limit };
};

const findNextTicketNumber = (orgId) => {
    const db = getDB();
    const row = db.prepare(
        `SELECT COUNT(*) AS total FROM ${DB_TABLES.TICKET} WHERE Org_Id = ?`
    ).get(orgId);
    return String(row.total + 1).padStart(6, "0");
};

const incrementCounter = (ticketId, column, delta = 1) => {
    const db = getDB();
    db.prepare(
        `UPDATE ${DB_TABLES.TICKET} SET ${column} = ${column} + ?, Modified_Time = datetime('now') WHERE Ticket_Id = ?`
    ).run(delta, ticketId);
};

module.exports = { ...base, findAll, findAgentQueue, findTeamQueue, findNextTicketNumber, incrementCounter };
