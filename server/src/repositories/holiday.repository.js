const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { HOLIDAY_COLUMNS, HOLIDAY_WORK_COLUMNS } = require("../models/holiday.model");

const base = createRepository({ table: DB_TABLES.HOLIDAY, primaryKey: "Holiday_Id", columns: HOLIDAY_COLUMNS });

/** Holidays, oldest first; `year` (e.g. 2026) narrows to that year. */
const findAll = (orgId, { year = null } = {}) => {
    const db = getDB();
    return year
        ? db.prepare(`SELECT * FROM ${DB_TABLES.HOLIDAY} WHERE Org_Id = ? AND Is_Deleted = 'N' AND substr(Holiday_Date, 1, 4) = ? ORDER BY Holiday_Date`).all(orgId, String(year))
        : db.prepare(`SELECT * FROM ${DB_TABLES.HOLIDAY} WHERE Org_Id = ? AND Is_Deleted = 'N' ORDER BY Holiday_Date`).all(orgId);
};

const findByDate = (orgId, holidayDate) => getDB().prepare(
    `SELECT * FROM ${DB_TABLES.HOLIDAY} WHERE Org_Id = ? AND Holiday_Date = ? AND Is_Deleted = 'N'`
).get(orgId, holidayDate);

/** Years that have at least one holiday, newest first (for the year picker). */
const findYears = (orgId) => getDB().prepare(
    `SELECT DISTINCT substr(Holiday_Date, 1, 4) AS year FROM ${DB_TABLES.HOLIDAY} WHERE Org_Id = ? AND Is_Deleted = 'N' ORDER BY year DESC`
).all(orgId).map((r) => Number(r.year));

const workBase = createRepository({ table: DB_TABLES.HOLIDAY_WORK, primaryKey: "Holiday_Work_Id", columns: HOLIDAY_WORK_COLUMNS });

const WORK_SELECT = `
    SELECT w.*, a.First_Name, a.Last_Name
    FROM ${DB_TABLES.HOLIDAY_WORK} w
    LEFT JOIN ${DB_TABLES.AGENT} a ON a.Agent_Id = w.Agent_Id`;

const findWorkByTicketId = (ticketId) => getDB().prepare(
    `${WORK_SELECT} WHERE w.Ticket_Id = ? AND w.Is_Deleted = 'N' ORDER BY w.Started_Time`
).all(ticketId);

const findOpenWork = (ticketId, agentId) => getDB().prepare(
    `SELECT * FROM ${DB_TABLES.HOLIDAY_WORK} WHERE Ticket_Id = ? AND Agent_Id = ? AND Ended_Time IS NULL AND Is_Deleted = 'N'`
).get(ticketId, agentId);

/** Timers still running from a holiday before `today` (YYYY-MM-DD, IST) - closed at that day's midnight. */
const findOpenWorkBefore = (today) => getDB().prepare(
    `SELECT * FROM ${DB_TABLES.HOLIDAY_WORK} WHERE Ended_Time IS NULL AND Is_Deleted = 'N' AND Holiday_Date < ?`
).all(today);

module.exports = {
    ...base,
    findAll,
    findByDate,
    findYears,
    work: { ...workBase, findWorkByTicketId, findOpenWork, findOpenWorkBefore }
};
