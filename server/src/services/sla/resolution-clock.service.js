const clockSegmentRepository = require("../../repositories/clock-segment.repository");
const picklistRepository = require("../../repositories/picklist.repository");
const bankRepository = require("../../repositories/bank.repository");
const ticketRepository = require("../../repositories/ticket.repository");
const { metrics: metricsRepository } = require("../../repositories/history.repository");
const generateId = require("../../utils/generate-id");
const DB_TABLES = require("../../constants/db-tables");
const { CLOCK_BEHAVIOUR } = require("../../constants/ticket.constants");
const { getCalendar, supportMinutesBetween, supportClockNow, isHolidayDate } = require("./business-calendar");
const holidayRepository = require("../../repositories/holiday.repository");
// Company holidays feed every calendar (registers the provider once).
require("./holiday-calendar");
const { toIst } = require("../../utils/time");

// Resolution time (not SLA): support-hours minutes of RUNNING-status segments; writes run in caller's txn.

const toDate = (value) => (value ? new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`) : null);

/** Clock behaviour configured for a status on the Config page; unknown statuses don't start the clock. */
const clockBehaviourForStatus = (orgId, status) => {
    if (!status) return CLOCK_BEHAVIOUR.NOT_STARTED;
    const row = picklistRepository.findByValue(orgId, "STATUS", status);
    return (row && row.Clock_Behaviour) || CLOCK_BEHAVIOUR.NOT_STARTED;
};

const calendarForBankId = (bankId) => getCalendar(bankId ? bankRepository.findById(bankId) : null);

// Holiday-timer minutes, only for days still a holiday (removed ones count via the window); never the SLA.
const holidayWorkMinutes = (ticketId, calendar, now = new Date()) =>
    holidayRepository.work.findWorkByTicketId(ticketId)
        .filter((w) => isHolidayDate(w.Holiday_Date, calendar))
        .reduce((total, w) => total + Math.max(0, Math.floor(((toDate(w.Ended_Time) || now) - toDate(w.Started_Time)) / 60000)), 0);

/** Support-hours minutes across every segment (an open one counts up to `now`), plus holiday-timer work. */
const computeResolutionMinutes = (ticketId, calendar, now = new Date()) =>
    clockSegmentRepository.findByTicketId(ticketId).reduce(
        (total, segment) => total + supportMinutesBetween(toDate(segment.Started_Time), toDate(segment.Ended_Time) || now, calendar),
        0
    ) + holidayWorkMinutes(ticketId, calendar, now);

// Live clock counts inside the support window, or on a holiday while a holiday timer runs (to midnight IST).
const liveClockFor = (ticketId, calendar, now) => {
    const todayIst = toIst(now).slice(0, 10);
    const timerRunning = isHolidayDate(todayIst, calendar) &&
        holidayRepository.work.findWorkByTicketId(ticketId).some((w) => !w.Ended_Time && w.Holiday_Date === todayIst);
    if (timerRunning) {
        return { counting: true, until: new Date(new Date(`${todayIst}T00:00:00+05:30`).getTime() + 24 * 60 * 60 * 1000) };
    }
    return supportClockNow(calendar, now);
};

// Moves the clock for a status change, returns ticket column changes; `ticket` pre-change, `bankId` after.
const applyStatusChange = ({ ticket, newStatus, bankId, actorAgentId, orgId, now = new Date() }) => {
    const nowIso = toIst(now);
    const oldState = ticket.Clock_State || CLOCK_BEHAVIOUR.NOT_STARTED;
    const newState = clockBehaviourForStatus(orgId, newStatus);
    const openSegment = clockSegmentRepository.findOpenByTicketId(ticket.Ticket_Id);
    const changes = { Clock_State: newState };

    if (newState === CLOCK_BEHAVIOUR.RUNNING && !openSegment) {
        clockSegmentRepository.insert({
            Segment_Id: generateId(DB_TABLES.TICKET_CLOCK_SEGMENT),
            Ticket_Id: ticket.Ticket_Id,
            Started_Time: nowIso,
            Status_At_Start: newStatus,
            Started_By: actorAgentId,
            Created_By: actorAgentId,
            Org_Id: orgId
        });
        if (!ticket.Resolution_Started_Time) changes.Resolution_Started_Time = nowIso;
    } else if (newState !== CLOCK_BEHAVIOUR.RUNNING && openSegment) {
        clockSegmentRepository.updateById(openSegment.Segment_Id, {
            Ended_Time: nowIso,
            Status_At_End: newStatus,
            Ended_By: actorAgentId,
            Modified_By: actorAgentId
        });
    }

    const reopened = oldState === CLOCK_BEHAVIOUR.STOPPED && newState !== CLOCK_BEHAVIOUR.STOPPED;
    if (newState === CLOCK_BEHAVIOUR.STOPPED && oldState !== CLOCK_BEHAVIOUR.STOPPED) {
        changes.Resolved_Time = nowIso;
        changes.Closed_Time = nowIso;
    } else if (reopened) {
        changes.Resolved_Time = null;
        changes.Closed_Time = null;
    }

    const metrics = metricsRepository.findMetricsByTicketId(ticket.Ticket_Id);
    if (metrics) {
        metricsRepository.updateById(metrics.Metric_Id, {
            // Reopen_Count is not bumped here: only an explicit Reopen (ticket-reopen.service.js) counts.
            Resolution_Time_Mins: computeResolutionMinutes(ticket.Ticket_Id, calendarForBankId(bankId), now),
            Modified_By: actorAgentId
        });
    }
    return changes;
};

// A status's clock behaviour changed: tickets in it move to the new behaviour from now (nothing back-dated).
const resyncTicketsInStatus = ({ orgId, status, actorAgentId, now = new Date() }) => {
    const newState = clockBehaviourForStatus(orgId, status);
    let moved = 0;
    for (const ticket of ticketRepository.findByStatus(orgId, status)) {
        if (ticket.Clock_State === newState) continue;
        const changes = applyStatusChange({ ticket, newStatus: status, bankId: ticket.Bank_Id, actorAgentId, orgId, now });
        ticketRepository.updateById(ticket.Ticket_Id, { ...changes, Modified_By: actorAgentId });
        moved += 1;
    }
    return moved;
};

// Bank calendar changed: re-total stored resolution time of its resolved tickets (open ones are always live).
const recomputeStoppedResolutionForBank = (bankId, actorAgentId) => {
    const calendar = calendarForBankId(bankId);
    for (const ticket of ticketRepository.findStoppedByBankId(bankId)) {
        const metrics = metricsRepository.findMetricsByTicketId(ticket.Ticket_Id);
        if (!metrics) continue;
        metricsRepository.updateById(metrics.Metric_Id, {
            Resolution_Time_Mins: computeResolutionMinutes(ticket.Ticket_Id, calendar),
            Modified_By: actorAgentId
        });
    }
};

/** Live resolution summary for the ticket panel. */
const getResolutionSummary = (ticket, now = new Date()) => ({
    clockState: ticket.Clock_State,
    resolutionMinutes: computeResolutionMinutes(ticket.Ticket_Id, calendarForBankId(ticket.Bank_Id), now),
    // Browser adds minutes since computedAt while `counting`, up to `until` (then refetches once).
    liveClock: ticket.Clock_State === CLOCK_BEHAVIOUR.RUNNING
        ? (({ counting, until }) => ({ counting, until: until ? toIst(until) : null, computedAt: toIst(now) }))(liveClockFor(ticket.Ticket_Id, calendarForBankId(ticket.Bank_Id), now))
        : null,
    resolutionStartedTime: ticket.Resolution_Started_Time,
    resolvedTime: ticket.Resolved_Time,
    segments: clockSegmentRepository.findByTicketId(ticket.Ticket_Id)
});

module.exports = {
    clockBehaviourForStatus,
    computeResolutionMinutes,
    applyStatusChange,
    resyncTicketsInStatus,
    recomputeStoppedResolutionForBank,
    getResolutionSummary,
    calendarForBankId
};
