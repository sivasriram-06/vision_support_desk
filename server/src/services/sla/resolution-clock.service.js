const clockSegmentRepository = require("../../repositories/clock-segment.repository");
const picklistRepository = require("../../repositories/picklist.repository");
const bankRepository = require("../../repositories/bank.repository");
const ticketRepository = require("../../repositories/ticket.repository");
const { metrics: metricsRepository } = require("../../repositories/history.repository");
const generateId = require("../../utils/generate-id");
const { CLOCK_BEHAVIOUR } = require("../../constants/ticket.constants");
const { getCalendar, workingMinutesBetween } = require("./business-calendar");

/**
 * Resolution time = how long our side actually worked a ticket - distinct
 * from the SLA due date. The clock RUNS while the ticket is in a RUNNING
 * status (e.g. "In Progress"), PAUSES while we wait on the bank (e.g. "On
 * Hold - Client"), and STOPS at Resolved/Closed. Each running stretch is a
 * row in HD_TICKET_CLOCK_SEGMENT; the total is the working-day minutes of
 * all segments (bank's non-working days excluded).
 *
 * Everything here that writes must run inside the caller's transaction.
 */

const toDate = (value) => (value ? new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`) : null);

/** Clock behaviour configured for a status on the Config page; unknown statuses don't start the clock. */
const clockBehaviourForStatus = (orgId, status) => {
    if (!status) return CLOCK_BEHAVIOUR.NOT_STARTED;
    const row = picklistRepository.findByValue(orgId, "STATUS", status);
    return (row && row.Clock_Behaviour) || CLOCK_BEHAVIOUR.NOT_STARTED;
};

const calendarForBankId = (bankId) => getCalendar(bankId ? bankRepository.findById(bankId) : null);

/** Working-day minutes across every segment; an open segment counts up to `now`. */
const computeResolutionMinutes = (ticketId, calendar, now = new Date()) =>
    clockSegmentRepository.findByTicketId(ticketId).reduce(
        (total, segment) => total + workingMinutesBetween(toDate(segment.Started_Time), toDate(segment.Ended_Time) || now, calendar),
        0
    );

/**
 * Moves the resolution clock for a status change and returns the
 * HD_TICKET_MASTER column changes that go with it (Clock_State,
 * Resolution_Started_Time, Resolved_Time, Closed_Time).
 * `ticket` is the row before the change; `bankId` the bank after it.
 */
const applyStatusChange = ({ ticket, newStatus, bankId, actorAgentId, orgId, now = new Date() }) => {
    const nowIso = now.toISOString();
    const oldState = ticket.Clock_State || CLOCK_BEHAVIOUR.NOT_STARTED;
    const newState = clockBehaviourForStatus(orgId, newStatus);
    const openSegment = clockSegmentRepository.findOpenByTicketId(ticket.Ticket_Id);
    const changes = { Clock_State: newState };

    if (newState === CLOCK_BEHAVIOUR.RUNNING && !openSegment) {
        clockSegmentRepository.insert({
            Segment_Id: generateId(),
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
            Resolution_Time_Mins: computeResolutionMinutes(ticket.Ticket_Id, calendarForBankId(bankId), now),
            Reopen_Count: (metrics.Reopen_Count || 0) + (reopened ? 1 : 0),
            Modified_By: actorAgentId
        });
    }
    return changes;
};

/**
 * An admin changed what a status does to the clock on the Config page:
 * tickets sitting in that status right now move to the new behaviour at
 * once (e.g. making "Open" RUNNING starts the clock on every Open ticket
 * from this moment - nothing is back-dated). Runs in the caller's
 * transaction.
 */
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

/** Live resolution summary for the ticket panel. */
const getResolutionSummary = (ticket, now = new Date()) => ({
    clockState: ticket.Clock_State,
    resolutionMinutes: computeResolutionMinutes(ticket.Ticket_Id, calendarForBankId(ticket.Bank_Id), now),
    resolutionStartedTime: ticket.Resolution_Started_Time,
    resolvedTime: ticket.Resolved_Time,
    segments: clockSegmentRepository.findByTicketId(ticket.Ticket_Id)
});

module.exports = { clockBehaviourForStatus, computeResolutionMinutes, applyStatusChange, resyncTicketsInStatus, getResolutionSummary };
