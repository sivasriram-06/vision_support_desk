const holidayRepository = require("../repositories/holiday.repository");
const assignmentRepository = require("../repositories/ticket-assignment.repository");
const organizationService = require("./organization.service");
const ticketService = require("./ticket.service");
const { calendarForBankId } = require("./sla/resolution-clock.service");
const { isHolidayDate } = require("./sla/business-calendar");
const { publish, REALTIME_EVENT } = require("../realtime/bus");
const generateId = require("../utils/generate-id");
const DB_TABLES = require("../constants/db-tables");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const { PERMISSIONS } = require("../constants/permissions");
const { CLOCK_BEHAVIOUR } = require("../constants/ticket.constants");
const { nowIst, toIst } = require("../utils/time");

/**
 * Holiday timer: a company holiday pauses resolution time, so an agent who
 * works a ticket that day starts a timer; the stretch is added back to the
 * ticket's resolution time (resolution-clock.service holidayWorkMinutes) -
 * never to the SLA. One running timer per agent per ticket; a timer still
 * running at midnight IST is closed then (closeOverdueTimers).
 */

const badRequest = (message) => new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, message);
const todayIst = () => nowIst().slice(0, 10);
const midnightAfter = (date) => toIst(new Date(`${date}T00:00:00+05:30`).getTime() + 24 * 60 * 60 * 1000);
const minutesBetween = (from, to) => Math.max(0, Math.floor((new Date(to) - new Date(from)) / 60000));

/** The ticket's current assignees, or a lead (assign_team / assign_any), may time work on it. */
const assertCanTime = (actor, ticketId) => {
    const has = (key) => actor.permissions.includes(key);
    if (assignmentRepository.findOpen(ticketId, actor.agentId)) return;
    if (has(PERMISSIONS.TICKETS_ASSIGN_ANY) || has(PERMISSIONS.TICKETS_ASSIGN_TEAM)) return;
    throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, "Only people assigned to this ticket can log holiday work on it");
};

/** Is the holiday timer usable on this ticket today? (for the panel button) */
const timerStatus = (ticket, agentId) => {
    const today = todayIst();
    const calendar = calendarForBankId(ticket.Bank_Id);
    const holiday = isHolidayDate(today, calendar);
    const org = organizationService.getDefaultOrganization();
    const row = holiday ? holidayRepository.findByDate(org.Organization_Id, today) : null;
    const open = agentId ? holidayRepository.work.findOpenWork(ticket.Ticket_Id, agentId) : null;
    return {
        holidayToday: holiday ? { date: today, name: row?.Holiday_Name || "Holiday" } : null,
        running: open ? { holidayWorkId: open.Holiday_Work_Id, startedTime: open.Started_Time } : null
    };
};

const startTimer = (ticketId, actor) => {
    const ticket = ticketService.getTicketById(ticketId);
    assertCanTime(actor, ticketId);
    const today = todayIst();
    if (!isHolidayDate(today, calendarForBankId(ticket.Bank_Id))) {
        throw badRequest("Today isn't a holiday for this ticket - resolution time is already counting");
    }
    if (ticket.Clock_State !== CLOCK_BEHAVIOUR.RUNNING) {
        throw badRequest("Move the ticket to a working status (e.g. In Progress) first - its clock isn't running");
    }
    if (holidayRepository.work.findOpenWork(ticketId, actor.agentId)) throw badRequest("Your holiday timer is already running on this ticket");
    const org = organizationService.getDefaultOrganization();
    const id = generateId(DB_TABLES.HOLIDAY_WORK);
    holidayRepository.work.insert({
        Holiday_Work_Id: id,
        Ticket_Id: ticketId,
        Agent_Id: actor.agentId,
        Holiday_Date: today,
        Started_Time: nowIst(),
        Created_By: actor.agentId,
        Org_Id: org.Organization_Id
    });
    publish({ type: REALTIME_EVENT.TICKET_CHANGED, ticketId, reason: "holiday-timer", actorAgentId: actor.agentId });
    return holidayRepository.work.findById(id);
};

const stopTimer = (ticketId, actor) => {
    ticketService.getTicketById(ticketId);
    const open = holidayRepository.work.findOpenWork(ticketId, actor.agentId);
    if (!open) throw badRequest("You have no holiday timer running on this ticket");
    // Never past that holiday's midnight.
    const end = [nowIst(), midnightAfter(open.Holiday_Date)].sort()[0];
    holidayRepository.work.updateById(open.Holiday_Work_Id, {
        Ended_Time: end,
        Minutes: minutesBetween(open.Started_Time, end),
        Modified_By: actor.agentId
    });
    publish({ type: REALTIME_EVENT.TICKET_CHANGED, ticketId, reason: "holiday-timer", actorAgentId: actor.agentId });
    return holidayRepository.work.findById(open.Holiday_Work_Id);
};

/** Timers left running past their holiday's midnight are closed at midnight (run by the minute job). */
const closeOverdueTimers = () => {
    const system = organizationService.getSystemAgent();
    for (const open of holidayRepository.work.findOpenWorkBefore(todayIst())) {
        const end = midnightAfter(open.Holiday_Date);
        holidayRepository.work.updateById(open.Holiday_Work_Id, {
            Ended_Time: end,
            Minutes: minutesBetween(open.Started_Time, end),
            Modified_By: system.Agent_Id
        });
        publish({ type: REALTIME_EVENT.TICKET_CHANGED, ticketId: open.Ticket_Id, reason: "holiday-timer" });
    }
};

module.exports = { timerStatus, startTimer, stopTimer, closeOverdueTimers };
