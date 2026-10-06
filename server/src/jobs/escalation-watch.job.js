const { getDB } = require("../config/db");
const DB_TABLES = require("../constants/db-tables");
const { publish, REALTIME_EVENT } = require("../realtime/bus");
const logger = require("../utils/logger");
const { nowIst } = require("../utils/time");

// Levels are reached by time, not actions, so each minute publish escalation.changed for triggers in (lastRun, now].
const WATCH_INTERVAL_MS = 60 * 1000;
let handle = null;
let lastRunIso = nowIst();

const runOnce = () => {
    const nowIso = nowIst();
    try {
        const rows = getDB().prepare(
            `SELECT DISTINCT e.Ticket_Id FROM ${DB_TABLES.TICKET_ESCALATION} e
             JOIN ${DB_TABLES.TICKET} t ON t.Ticket_Id = e.Ticket_Id
             WHERE e.Trigger_Time > ? AND e.Trigger_Time <= ?
               AND t.Clock_State <> 'STOPPED' AND t.Is_Deleted = 'N'`
        ).all(lastRunIso, nowIso);
        if (rows.length > 0) {
            publish({ type: REALTIME_EVENT.ESCALATION_CHANGED, ticketIds: rows.map((r) => r.Ticket_Id) });
        }
    } catch (error) {
        logger.error("Escalation watch failed:", error);
    }
    // Same minute tick: close holiday timers left running past midnight IST.
    try {
        require("../services/holiday-work.service").closeOverdueTimers();
    } catch (error) {
        logger.error("Holiday timer close failed:", error);
    }
    lastRunIso = nowIso;
};

const startEscalationWatchJob = () => {
    if (handle) return;
    handle = setInterval(runOnce, WATCH_INTERVAL_MS);
};

const stopEscalationWatchJob = () => {
    if (handle) clearInterval(handle);
    handle = null;
};

module.exports = { startEscalationWatchJob, stopEscalationWatchJob };
