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
 * List/queue rows join in display names (contact, account, assignee,
 * department, team) so the frontend never has to resolve raw *_Id columns
 * itself. Ticket_Id's own primary key isn't ambiguous with the joined
 * tables' ids since every SELECT column is qualified.
 */
const LIST_SELECT = `
    SELECT t.*,
        c.First_Name AS Contact_First_Name, c.Last_Name AS Contact_Last_Name, c.Email AS Contact_Email,
        acc.Account_Name AS Account_Name,
        a.First_Name AS Assignee_First_Name, a.Last_Name AS Assignee_Last_Name,
        d.Department_Name AS Department_Name,
        tm.Team_Name AS Team_Name
    FROM ${DB_TABLES.TICKET} t
    LEFT JOIN ${DB_TABLES.CONTACT} c ON c.Contact_Id = t.Contact_Id
    LEFT JOIN ${DB_TABLES.ACCOUNT} acc ON acc.Account_Id = t.Account_Id
    LEFT JOIN ${DB_TABLES.AGENT} a ON a.Agent_Id = t.Assignee_Id
    LEFT JOIN ${DB_TABLES.DEPARTMENT} d ON d.Department_Id = t.Department_Id
    LEFT JOIN ${DB_TABLES.TEAM} tm ON tm.Team_Id = t.Team_Id
`;
const LIST_COUNT_SELECT = `SELECT COUNT(*) AS total FROM ${DB_TABLES.TICKET} t`;

/**
 * All Cases: paginated ticket list with filters/search/sort, per
 * GET /api/v1/tickets.
 */
const findAll = (orgId, query = {}) => {
    const db = getDB();
    const { limit, offset, page } = parsePagination(query);
    const params = [orgId];
    let where = "t.Org_Id = ? AND t.Is_Deleted = 'N'";

    if (query.status) {
        where += " AND t.Status = ?";
        params.push(query.status);
    }
    if (query.statusType) {
        where += " AND t.Status_Type = ?";
        params.push(query.statusType);
    }
    if (query.priority) {
        where += " AND t.Priority = ?";
        params.push(query.priority);
    }
    if (query.departmentId) {
        where += " AND t.Department_Id = ?";
        params.push(query.departmentId);
    }
    if (query.teamId) {
        where += " AND t.Team_Id = ?";
        params.push(query.teamId);
    }
    if (query.assigneeId) {
        where += " AND t.Assignee_Id = ?";
        params.push(query.assigneeId);
    }
    if (query.contactId) {
        where += " AND t.Contact_Id = ?";
        params.push(query.contactId);
    }
    if (query.search) {
        where += " AND (t.Subject LIKE ? OR t.Ticket_Number LIKE ?)";
        const term = `%${query.search}%`;
        params.push(term, term);
    }

    const sortBy = SORTABLE_FIELDS.has(query.sortBy) ? query.sortBy : "Created_Time";
    const sortOrder = String(query.sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";

    const rows = db.prepare(
        `${LIST_SELECT} WHERE ${where} ORDER BY t.${sortBy} ${sortOrder} LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    const total = db.prepare(
        `${LIST_COUNT_SELECT} WHERE ${where}`
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
    let where = "t.Org_Id = ? AND t.Team_Id = ? AND t.Is_Deleted = 'N'";

    if (query.unassignedOnly === "true" || query.unassignedOnly === true) {
        where += " AND t.Assignee_Id IS NULL";
    }

    const rows = db.prepare(
        `${LIST_SELECT} WHERE ${where} ORDER BY t.Created_Time DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    const total = db.prepare(
        `${LIST_COUNT_SELECT} WHERE ${where}`
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
