const escalationLevelRepository = require("../../repositories/escalation-level.repository");
const ticketEscalationRepository = require("../../repositories/ticket-escalation.repository");
const bankRepository = require("../../repositories/bank.repository");
const ticketRepository = require("../../repositories/ticket.repository");
const generateId = require("../../utils/generate-id");
const DB_TABLES = require("../../constants/db-tables");
const { CLOCK_BEHAVIOUR } = require("../../constants/ticket.constants");
const { getCalendar, addWorkingHours } = require("./business-calendar");
// Company holidays feed every calendar (registers the provider once).
require("./holiday-calendar");
const { toIst } = require("../../utils/time");

// Level N is reached Offset_Hours from the due date on the bank calendar; writes run in the caller's txn.

const toDate = (value) => new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);

// Re-derives trigger times from the current due date, bank and priority; no due date means no escalation.
const rebuildTriggers = (ticket, orgId) => {
    ticketEscalationRepository.deleteByTicketId(ticket.Ticket_Id);
    if (!ticket.Priority || !ticket.Response_Due_Date) return;

    const levels = escalationLevelRepository.findByPriority(orgId, ticket.Priority);
    if (levels.length === 0) return;

    const calendar = getCalendar(ticket.Bank_Id ? bankRepository.findById(ticket.Bank_Id) : null);
    const dueDate = toDate(ticket.Response_Due_Date);
    for (const level of levels) {
        ticketEscalationRepository.insert({
            Ticket_Escalation_Id: generateId(DB_TABLES.TICKET_ESCALATION),
            Ticket_Id: ticket.Ticket_Id,
            Level_No: level.Level_No,
            Trigger_Time: toIst(addWorkingHours(dueDate, level.Offset_Hours, calendar)),
            Org_Id: orgId
        });
    }
};

/** A priority's escalation levels changed on the Config page: re-derive every open ticket on it. */
const rebuildTriggersForPriority = (orgId, priority) => {
    for (const ticket of ticketRepository.findOpenByPriority(orgId, priority)) {
        rebuildTriggers(ticket, orgId);
    }
};

/** Escalation block for the ticket panel: current level plus every level's trigger time. */
const getTicketEscalation = (ticket, now = new Date()) => {
    const nowIso = toIst(now);
    const stopped = ticket.Clock_State === CLOCK_BEHAVIOUR.STOPPED;
    const levels = ticketEscalationRepository.findByTicketId(ticket.Ticket_Id).map((row) => ({
        levelNo: row.Level_No,
        triggerTime: row.Trigger_Time,
        reached: row.Trigger_Time <= nowIso
    }));
    const reached = levels.filter((level) => level.reached);
    const next = levels.find((level) => !level.reached);
    return {
        level: stopped || reached.length === 0 ? 0 : reached[reached.length - 1].levelNo,
        nextLevelNo: stopped || !next ? null : next.levelNo,
        nextTriggerTime: stopped || !next ? null : next.triggerTime,
        levels
    };
};

module.exports = { rebuildTriggers, rebuildTriggersForPriority, getTicketEscalation };
