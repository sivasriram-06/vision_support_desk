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
    "Created_Time", "Modified_Time", "Due_Date", "Response_Due_Date", "Priority", "Status", "Subject"
]);

/**
 * Current escalation level of `t`: the highest level whose trigger time
 * has passed, 0 when none has or the ticket is resolved/closed. Trigger
 * times are ISO-8601 UTC, matching strftime's format, so text comparison
 * orders correctly.
 */
const NOW_ISO_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const ESCALATION_LEVEL_SQL = `
    CASE WHEN t.Clock_State = 'STOPPED' THEN 0 ELSE COALESCE((
        SELECT MAX(e.Level_No) FROM ${DB_TABLES.TICKET_ESCALATION} e
        WHERE e.Ticket_Id = t.Ticket_Id AND e.Trigger_Time <= ${NOW_ISO_SQL}
    ), 0) END`;
const NEXT_ESCALATION_TIME_SQL = `
    CASE WHEN t.Clock_State = 'STOPPED' THEN NULL ELSE (
        SELECT MIN(e.Trigger_Time) FROM ${DB_TABLES.TICKET_ESCALATION} e
        WHERE e.Ticket_Id = t.Ticket_Id AND e.Trigger_Time > ${NOW_ISO_SQL}
    ) END`;

/**
 * Current assignees of `t` (open HD_TICKET_ASSIGNMENT rows) as a JSON
 * array, oldest assignment first. Parsed into `Assignees` by withAssignees.
 */
const ASSIGNEES_JSON_SQL = `(
    SELECT json_group_array(json_object(
        'agentId', x.Agent_Id, 'firstName', x.First_Name, 'lastName', x.Last_Name,
        'teamId', x.Department_Id, 'teamName', x.Department_Name, 'teamType', x.Team_Type,
        'crossTeam', x.Is_Cross_Team, 'assignedTime', x.Assigned_Time, 'seen', x.Seen_Time IS NOT NULL,
        'assignedBy', x.Assigned_By, 'assignedByName', x.Assigned_By_Name, 'note', x.Note,
        'assignmentId', x.Assignment_Id, 'workState', x.Work_State, 'roundNo', x.Round_No
    )) FROM (
        SELECT asg.Agent_Id, ag.First_Name, ag.Last_Name, asg.Department_Id, dp.Department_Name, dp.Team_Type,
               asg.Is_Cross_Team, asg.Assigned_Time, asg.Seen_Time, asg.Assigned_By, asg.Note,
               asg.Assignment_Id, asg.Work_State, asg.Round_No,
               TRIM(COALESCE(abg.First_Name, '') || ' ' || COALESCE(abg.Last_Name, '')) AS Assigned_By_Name
        FROM ${DB_TABLES.TICKET_ASSIGNMENT} asg
        JOIN ${DB_TABLES.AGENT} ag ON ag.Agent_Id = asg.Agent_Id
        LEFT JOIN ${DB_TABLES.AGENT} abg ON abg.Agent_Id = asg.Assigned_By
        LEFT JOIN ${DB_TABLES.DEPARTMENT} dp ON dp.Department_Id = asg.Department_Id
        WHERE asg.Ticket_Id = t.Ticket_Id AND asg.Released_Time IS NULL
        ORDER BY asg.Assigned_Time ASC
    ) x
)`;

/**
 * List/queue rows join in display names (contact, account, assignees,
 * department, bank) so the frontend never has to resolve raw *_Id columns
 * itself. Ticket_Id's own primary key isn't ambiguous with the joined
 * tables' ids since every SELECT column is qualified.
 */
const LIST_SELECT = `
    SELECT t.*,
        c.First_Name AS Contact_First_Name, c.Last_Name AS Contact_Last_Name, c.Email AS Contact_Email,
        acc.Account_Name AS Account_Name,
        d.Department_Name AS Department_Name,
        bk.Bank_Name AS Bank_Name,
        ${ASSIGNEES_JSON_SQL} AS Assignees_Json,
        ${ESCALATION_LEVEL_SQL} AS Escalation_Level,
        ${NEXT_ESCALATION_TIME_SQL} AS Next_Escalation_Time
    FROM ${DB_TABLES.TICKET} t
    LEFT JOIN ${DB_TABLES.CONTACT} c ON c.Contact_Id = t.Contact_Id
    LEFT JOIN ${DB_TABLES.ACCOUNT} acc ON acc.Account_Id = t.Account_Id
    LEFT JOIN ${DB_TABLES.DEPARTMENT} d ON d.Department_Id = t.Department_Id
    LEFT JOIN ${DB_TABLES.BANK} bk ON bk.Bank_Id = t.Bank_Id
`;
const LIST_COUNT_SELECT = `SELECT COUNT(*) AS total FROM ${DB_TABLES.TICKET} t`;

// Open assignment for an agent on `t` - the "assigned to" filter.
const HAS_OPEN_ASSIGNMENT_SQL = `EXISTS (
    SELECT 1 FROM ${DB_TABLES.TICKET_ASSIGNMENT} fa
    WHERE fa.Ticket_Id = t.Ticket_Id AND fa.Agent_Id = ? AND fa.Released_Time IS NULL
)`;
const HAS_NO_ASSIGNEE_SQL = `NOT EXISTS (
    SELECT 1 FROM ${DB_TABLES.TICKET_ASSIGNMENT} fa
    WHERE fa.Ticket_Id = t.Ticket_Id AND fa.Released_Time IS NULL
)`;

/** Replaces the raw Assignees_Json column with a parsed Assignees array. */
const withAssignees = (row) => {
    if (!row) return row;
    const { Assignees_Json: json, ...rest } = row;
    const assignees = json ? JSON.parse(json).map((a) => ({ ...a, crossTeam: a.crossTeam === "Y", seen: Boolean(a.seen) })) : [];
    return { ...rest, Assignees: assignees };
};

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
    // SLA breached: either still open and past its due date (overdue now),
    // or resolved/closed after its due date - a breach stays a breach once
    // the ticket is closed. Response_Due_Date and Resolved_Time are both
    // ISO-8601 UTC, so string comparison orders correctly.
    if (query.slaBreached === "true") {
        where += ` AND t.Response_Due_Date IS NOT NULL AND (
            (t.Clock_State <> 'STOPPED' AND t.Response_Due_Date < ?)
            OR (t.Clock_State = 'STOPPED' AND t.Resolved_Time > t.Response_Due_Date)
        )`;
        params.push(new Date().toISOString());
    }
    // Escalation: "any" = level 1 or above, or an exact level number.
    if (query.escalationLevel === "any") {
        where += ` AND ${ESCALATION_LEVEL_SQL} >= 1`;
    } else if (query.escalationLevel) {
        where += ` AND ${ESCALATION_LEVEL_SQL} = ?`;
        params.push(Number(query.escalationLevel));
    }
    if (query.departmentId) {
        where += " AND t.Department_Id = ?";
        params.push(query.departmentId);
    }
    if (query.bankId) {
        where += " AND t.Bank_Id = ?";
        params.push(query.bankId);
    }
    if (query.assigneeId) {
        where += ` AND ${HAS_OPEN_ASSIGNMENT_SQL}`;
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
        `${LIST_SELECT} WHERE ${where} ORDER BY t.${sortBy} IS NULL, t.${sortBy} ${sortOrder} LIMIT ? OFFSET ?`
    ).all(...params, limit, offset).map(withAssignees);

    const total = db.prepare(
        `${LIST_COUNT_SELECT} WHERE ${where}`
    ).get(...params).total;

    return { rows, total, page, limit };
};

/** Agent Queue: tickets currently assigned to one agent. */
const findAgentQueue = (orgId, agentId, query = {}) => {
    return findAll(orgId, { ...query, assigneeId: agentId });
};

/** Bank Queue: tickets for a bank, optionally unassigned-only. */
const findBankQueue = (orgId, bankId, query = {}) => {
    const db = getDB();
    const { limit, offset, page } = parsePagination(query);
    const params = [orgId, bankId];
    let where = "t.Org_Id = ? AND t.Bank_Id = ? AND t.Is_Deleted = 'N'";

    if (query.unassignedOnly === "true" || query.unassignedOnly === true) {
        where += ` AND ${HAS_NO_ASSIGNEE_SQL}`;
    }

    const rows = db.prepare(
        `${LIST_SELECT} WHERE ${where} ORDER BY t.Created_Time DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset).map(withAssignees);

    const total = db.prepare(
        `${LIST_COUNT_SELECT} WHERE ${where}`
    ).get(...params).total;

    return { rows, total, page, limit };
};

/**
 * Escalation queue: every open ticket at level 1 or above (unpaginated -
 * the board groups them by level), most escalated and most overdue first.
 */
const findEscalated = (orgId, query = {}) => {
    const db = getDB();
    const params = [orgId];
    let where = `t.Org_Id = ? AND t.Is_Deleted = 'N' AND ${ESCALATION_LEVEL_SQL} >= 1`;

    if (query.departmentId) {
        where += " AND t.Department_Id = ?";
        params.push(query.departmentId);
    }
    if (query.bankId) {
        where += " AND t.Bank_Id = ?";
        params.push(query.bankId);
    }
    if (query.priority) {
        where += " AND t.Priority = ?";
        params.push(query.priority);
    }

    return db.prepare(
        `${LIST_SELECT} WHERE ${where} ORDER BY Escalation_Level DESC, t.Response_Due_Date ASC`
    ).all(...params).map(withAssignees);
};

/**
 * My Tickets. Scopes, each for open (not resolved/closed) tickets unless
 * includeClosed:
 *   assigned    - I am a current assignee
 *   assignedBy  - I assigned someone else, and that assignment is still open
 *   team        - the ticket belongs to my team, or someone in my team is
 *                 a current assignee (team leads)
 * Rows carry My_Assigned_* (who assigned me / whom I assigned, and when)
 * for the scope's own assignment.
 */
const findMyTickets = (orgId, { scope, agentId, teamId, includeClosed = false }) => {
    const db = getDB();
    let scopeSql;
    let extraSelect = "";

    if (scope === "assigned") {
        extraSelect = `,
            (SELECT ma.Assigned_Time FROM ${DB_TABLES.TICKET_ASSIGNMENT} ma WHERE ma.Ticket_Id = t.Ticket_Id AND ma.Agent_Id = @agentId AND ma.Released_Time IS NULL) AS My_Assigned_Time,
            (SELECT ab.First_Name || ' ' || ab.Last_Name FROM ${DB_TABLES.TICKET_ASSIGNMENT} ma JOIN ${DB_TABLES.AGENT} ab ON ab.Agent_Id = ma.Assigned_By
                WHERE ma.Ticket_Id = t.Ticket_Id AND ma.Agent_Id = @agentId AND ma.Released_Time IS NULL) AS My_Assigned_By_Name,
            (SELECT CASE WHEN ma.Seen_Time IS NULL THEN 1 ELSE 0 END FROM ${DB_TABLES.TICKET_ASSIGNMENT} ma WHERE ma.Ticket_Id = t.Ticket_Id AND ma.Agent_Id = @agentId AND ma.Released_Time IS NULL) AS My_Is_New`;
        scopeSql = `EXISTS (SELECT 1 FROM ${DB_TABLES.TICKET_ASSIGNMENT} s WHERE s.Ticket_Id = t.Ticket_Id AND s.Agent_Id = @agentId AND s.Released_Time IS NULL)`;
    } else if (scope === "assignedBy") {
        extraSelect = `,
            (SELECT MAX(ma.Assigned_Time) FROM ${DB_TABLES.TICKET_ASSIGNMENT} ma WHERE ma.Ticket_Id = t.Ticket_Id AND ma.Assigned_By = @agentId AND ma.Agent_Id <> @agentId AND ma.Released_Time IS NULL) AS My_Assigned_Time`;
        scopeSql = `EXISTS (SELECT 1 FROM ${DB_TABLES.TICKET_ASSIGNMENT} s WHERE s.Ticket_Id = t.Ticket_Id AND s.Assigned_By = @agentId AND s.Agent_Id <> @agentId AND s.Released_Time IS NULL)`;
    } else {
        scopeSql = `(t.Department_Id = @teamId OR EXISTS (
            SELECT 1 FROM ${DB_TABLES.TICKET_ASSIGNMENT} s WHERE s.Ticket_Id = t.Ticket_Id AND s.Department_Id = @teamId AND s.Released_Time IS NULL
        ))`;
    }

    const closedSql = includeClosed ? "" : "AND t.Clock_State <> 'STOPPED'";
    return db.prepare(
        `${LIST_SELECT.replace("FROM " + DB_TABLES.TICKET + " t", `${extraSelect} FROM ${DB_TABLES.TICKET} t`)}
         WHERE t.Org_Id = @orgId AND t.Is_Deleted = 'N' AND ${scopeSql} ${closedSql}
         ORDER BY t.Response_Due_Date IS NULL, t.Response_Due_Date ASC, t.Created_Time DESC`
    ).all({ orgId, agentId, teamId: teamId || "" }).map(withAssignees);
};

/** My Tickets tab badges: open counts per scope, plus unseen assignments for me. */
const countMyTickets = (orgId, { agentId, teamId }) => {
    const db = getDB();
    const open = `t.Org_Id = @orgId AND t.Is_Deleted = 'N' AND t.Clock_State <> 'STOPPED'`;
    return db.prepare(
        `SELECT
            (SELECT COUNT(*) FROM ${DB_TABLES.TICKET} t WHERE ${open} AND EXISTS (
                SELECT 1 FROM ${DB_TABLES.TICKET_ASSIGNMENT} s WHERE s.Ticket_Id = t.Ticket_Id AND s.Agent_Id = @agentId AND s.Released_Time IS NULL)) AS assigned,
            (SELECT COUNT(*) FROM ${DB_TABLES.TICKET} t WHERE ${open} AND EXISTS (
                SELECT 1 FROM ${DB_TABLES.TICKET_ASSIGNMENT} s WHERE s.Ticket_Id = t.Ticket_Id AND s.Agent_Id = @agentId AND s.Released_Time IS NULL AND s.Seen_Time IS NULL)) AS unseen,
            (SELECT COUNT(*) FROM ${DB_TABLES.TICKET} t WHERE ${open} AND EXISTS (
                SELECT 1 FROM ${DB_TABLES.TICKET_ASSIGNMENT} s WHERE s.Ticket_Id = t.Ticket_Id AND s.Assigned_By = @agentId AND s.Agent_Id <> @agentId AND s.Released_Time IS NULL)) AS assignedBy,
            (SELECT COUNT(*) FROM ${DB_TABLES.TICKET} t WHERE ${open} AND (t.Department_Id = @teamId OR EXISTS (
                SELECT 1 FROM ${DB_TABLES.TICKET_ASSIGNMENT} s WHERE s.Ticket_Id = t.Ticket_Id AND s.Department_Id = @teamId AND s.Released_Time IS NULL))) AS team`
    ).get({ orgId, agentId, teamId: teamId || "" });
};

/** One ticket with the list joins (assignees, names, escalation level). */
const findDetailById = (ticketId) => {
    const db = getDB();
    return withAssignees(db.prepare(`${LIST_SELECT} WHERE t.Ticket_Id = ? AND t.Is_Deleted = 'N'`).get(ticketId));
};

/** Open tickets carrying a priority, for re-deriving escalation triggers when its levels change. */
const findOpenByPriority = (orgId, priority) => {
    const db = getDB();
    return db.prepare(
        `SELECT Ticket_Id, Priority, Bank_Id, Response_Due_Date FROM ${DB_TABLES.TICKET}
         WHERE Org_Id = ? AND Priority = ? AND Clock_State <> 'STOPPED' AND Is_Deleted = 'N'`
    ).all(orgId, priority);
};

/** Resolved/closed tickets on a bank - their stored resolution total follows the bank's calendar. */
const findStoppedByBankId = (bankId) => {
    const db = getDB();
    return db.prepare(
        `SELECT Ticket_Id FROM ${DB_TABLES.TICKET} WHERE Bank_Id = ? AND Clock_State = 'STOPPED' AND Is_Deleted = 'N'`
    ).all(bankId);
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

/** Tickets on a bank whose SLA still matters (has a priority, not resolved/closed). */
const findOpenWithPriorityByBankId = (bankId) => {
    const db = getDB();
    return db.prepare(
        `SELECT Ticket_Id, Created_Time, Priority FROM ${DB_TABLES.TICKET}
         WHERE Bank_Id = ? AND Priority IS NOT NULL AND Clock_State <> 'STOPPED' AND Is_Deleted = 'N'`
    ).all(bankId);
};

/** Tickets currently in a given Status (text match - Status is a plain picklist label). */
const findByStatus = (orgId, status) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.TICKET} WHERE Org_Id = ? AND Status = ? AND Is_Deleted = 'N'`
    ).all(orgId, status);
};

/** Follows a Status rename on the Config page so tickets keep a status that still exists. */
const renameStatus = (orgId, oldStatus, newStatus, modifiedBy) => {
    const db = getDB();
    db.prepare(
        `UPDATE ${DB_TABLES.TICKET} SET Status = ?, Modified_By = ?, Modified_Time = datetime('now')
         WHERE Org_Id = ? AND Status = ? AND Is_Deleted = 'N'`
    ).run(newStatus, modifiedBy, orgId, oldStatus);
};

module.exports = {
    ...base,
    findAll,
    findAgentQueue,
    findBankQueue,
    findEscalated,
    findMyTickets,
    countMyTickets,
    findDetailById,
    findOpenByPriority,
    findStoppedByBankId,
    findNextTicketNumber,
    incrementCounter,
    findOpenWithPriorityByBankId,
    findByStatus,
    renameStatus
};
