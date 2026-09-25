const escalationLevelRepository = require("../../repositories/escalation-level.repository");
const ticketEscalationRepository = require("../../repositories/ticket-escalation.repository");
const bankRepository = require("../../repositories/bank.repository");
const ticketRepository = require("../../repositories/ticket.repository");
const generateId = require("../../utils/generate-id");
const { CLOCK_BEHAVIOUR } = require("../../constants/ticket.constants");
const { getCalendar, addWorkingHours } = require("./business-calendar");

/**
 * Escalation: how far a ticket has slipped against its SLA due date.
 * Level N of the ticket's priority (HD_ESCALATION_LEVEL, Config page) is
 * reached Offset_Hours from the due date on the bank's SLA calendar -
 * e.g. P1 L1 = 4h before due, L2 = at due, L3 = 8h after. Trigger times
 * are stored per ticket (HD_TICKET_ESCALATION); the current level is read
 * off them against "now" in SQL (ticket.repository.js), and resolving or
 * closing the ticket takes it out of escalation.
 *
 * Writes run inside the caller's transaction.
 */

const toDate = (value) => new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);

/**
 * Re-derives a ticket's trigger times from its current due date, bank and
 * priority. `ticket` needs Ticket_Id, Priority, Bank_Id, Response_Due_Date.
 * No due date (no priority / no SLA configured) means no escalation.
 */
const rebuildTriggers = (ticket, orgId) => {
    ticketEscalationRepository.deleteByTicketId(ticket.Ticket_Id);
    if (!ticket.Priority || !ticket.Response_Due_Date) return;

    const levels = escalationLevelRepository.findByPriority(orgId, ticket.Priority);
    if (levels.length === 0) return;

    const calendar = getCalendar(ticket.Bank_Id ? bankRepository.findById(ticket.Bank_Id) : null);
    const dueDate = toDate(ticket.Response_Due_Date);
    for (const level of levels) {
        ticketEscalationRepository.insert({
            Ticket_Escalation_Id: generateId(),
            Ticket_Id: ticket.Ticket_Id,
            Level_No: level.Level_No,
            Trigger_Time: addWorkingHours(dueDate, level.Offset_Hours, calendar).toISOString(),
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
    const nowIso = now.toISOString();
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
