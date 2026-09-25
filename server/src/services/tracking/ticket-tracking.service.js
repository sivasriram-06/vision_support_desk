const ticketRepository = require("../../repositories/ticket.repository");
const assignmentRepository = require("../../repositories/ticket-assignment.repository");
const workRepository = require("../../repositories/assignment-work.repository");
const agentRepository = require("../../repositories/agent.repository");
const bankRepository = require("../../repositories/bank.repository");
const departmentRepository = require("../../repositories/department.repository");
const { history: historyRepository } = require("../../repositories/history.repository");
const { conversation: conversationRepository, comment: commentRepository } = require("../../repositories/conversation.repository");
const organizationService = require("../organization.service");
const ticketService = require("../ticket.service");
const { clockBehaviourForStatus } = require("../sla/resolution-clock.service");
const { getCalendar, supportMinutesBetween } = require("../sla/business-calendar");
const { TICKET_HISTORY_EVENT, WORK_STATE, CLOCK_BEHAVIOUR, NEW_EMAIL_TICKET_STATUS } = require("../../constants/ticket.constants");
const { WAIT_STATES, elapsedMinutes, unionMinutes, statusStretches, sumBy, criticalPath, longestWait } = require("./tracking-math");

/**
 * GET /tickets/:id/tracking - the internal Tracking tab in one response:
 *
 *   events         every change, comment, email and work update in time
 *                  order, each with how long the ticket sat until the next
 *   lanes          one per assignment (person's work): state stretches,
 *                  blockers, time per state, held time, logged effort
 *   statuses       time spent in each ticket status
 *   summary        current holders, busy vs idle, time per team / person,
 *                  the longest wait and the critical path
 *
 * Durations are given as elapsed minutes and as bank support-hours minutes.
 */

const toMs = (value) => (value ? new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`).getTime() : null);
const fullName = (a) => (a ? [a.First_Name, a.Last_Name].filter(Boolean).join(" ") : "System");

const WORK_STATE_LABEL = {
    PENDING: "Pending (waiting for handover)",
    WAITING: "Waiting on another team",
    READY: "Ready to start",
    IN_PROGRESS: "In progress",
    ON_HOLD: "On hold",
    DONE: "Done"
};

const formatMins = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
};

const getTracking = (ticketId, now = new Date()) => {
    const org = organizationService.getDefaultOrganization();
    const orgId = org.Organization_Id;
    ticketService.getTicketById(ticketId);
    const ticket = ticketRepository.findDetailById(ticketId);
    const bank = ticket.Bank_Id ? bankRepository.findById(ticket.Bank_Id) : null;
    const calendar = getCalendar(bank);

    const startMs = toMs(ticket.Created_Time);
    const stopped = ticket.Clock_State === CLOCK_BEHAVIOUR.STOPPED && ticket.Resolved_Time;
    const endMs = stopped ? toMs(ticket.Resolved_Time) : now.getTime();
    const measure = (s, e) => ({ elapsed: elapsedMinutes(s, e), support: supportMinutesBetween(new Date(s), new Date(e), calendar) });

    const agents = new Map(agentRepository.findAll(orgId).map((a) => [a.Agent_Id, a]));
    const teams = new Map(departmentRepository.findAll(orgId).map((d) => [d.Department_Id, d]));
    const agentName = (id) => (id ? fullName(agents.get(id)) : "System");

    const history = historyRepository.findByTicketId(ticketId);
    const assignments = assignmentRepository.findByTicketId(ticketId);
    const assignmentById = new Map(assignments.map((a) => [a.Assignment_Id, a]));
    const stateLogs = workRepository.findStateLogsByTicketId(ticketId);
    const dependencies = workRepository.findDependenciesByTicketId(ticketId);
    const worklogs = workRepository.findWorklogsByTicketId(ticketId);
    const comments = commentRepository.findCommentsByTicketId(ticketId);
    const conversations = conversationRepository.findByTicketId(ticketId);

    // --- lanes: one per assignment -------------------------------------
    const lanes = assignments.map((a) => {
        const laneEnd = a.Released_Time ? toMs(a.Released_Time) : endMs;
        const stretches = stateLogs
            .filter((s) => s.Assignment_Id === a.Assignment_Id)
            .map((s) => ({ state: s.Work_State, start: toMs(s.Started_Time), end: s.Ended_Time ? toMs(s.Ended_Time) : laneEnd, note: s.Note }))
            .filter((s) => s.end >= s.start);
        // Work finished = start of its DONE stretch; the lane spans assign -> done/released/now.
        const done = stretches.find((s) => s.state === WORK_STATE.DONE);
        const spanEnd = done ? done.start : laneEnd;
        const byState = {};
        for (const s of stretches) {
            if (s.state === WORK_STATE.DONE) continue;
            const m = measure(s.start, s.end);
            byState[s.state] = byState[s.state] || { elapsed: 0, support: 0 };
            byState[s.state].elapsed += m.elapsed;
            byState[s.state].support += m.support;
        }
        const logged = worklogs.filter((w) => w.Assignment_Id === a.Assignment_Id).reduce((sum, w) => sum + w.Minutes, 0);
        return {
            assignmentId: a.Assignment_Id,
            agentId: a.Agent_Id,
            name: fullName(a),
            teamId: a.Department_Id,
            teamName: a.Department_Name || "No team",
            teamType: a.Team_Type || null,
            crossTeam: a.Is_Cross_Team === "Y",
            roundNo: a.Round_No,
            assignedBy: a.Assigned_By,
            assignedByName: agentName(a.Assigned_By),
            assignedTime: a.Assigned_Time,
            releasedTime: a.Released_Time,
            releasedByName: a.Released_By ? agentName(a.Released_By) : null,
            current: !a.Released_Time,
            workState: a.Work_State,
            note: a.Note,
            stretches: stretches.map((s) => ({ ...s, startTime: new Date(s.start).toISOString(), endTime: new Date(s.end).toISOString(), open: s.end === laneEnd && !a.Released_Time && s === stretches[stretches.length - 1] })),
            blockedBy: dependencies.filter((d) => d.Assignment_Id === a.Assignment_Id).map((d) => d.Depends_On_Assignment_Id),
            byState,
            span: measure(toMs(a.Assigned_Time), spanEnd),
            held: measure(toMs(a.Assigned_Time), laneEnd),
            loggedMinutes: logged
        };
    });
    const laneById = new Map(lanes.map((l) => [l.assignmentId, l]));

    // --- ticket status stretches ----------------------------------------
    const statusChanges = history
        .filter((h) => h.Event_Name === TICKET_HISTORY_EVENT.STATUS_CHANGE)
        .map((h) => ({ time: toMs(h.Event_Time), from: h.Old_Value, to: h.New_Value }));
    const initialStatus = statusChanges.length ? statusChanges[0].from || NEW_EMAIL_TICKET_STATUS : ticket.Status;
    const statuses = statusStretches({ startMs, endMs, initialStatus, changes: statusChanges }).map((s) => ({
        status: s.status,
        clock: clockBehaviourForStatus(orgId, s.status),
        startTime: new Date(s.start).toISOString(),
        endTime: new Date(s.end).toISOString(),
        ...measure(s.start, s.end)
    }));
    const statusTotals = sumBy(
        statuses.map((s) => ({ status: s.status, start: toMs(s.startTime), end: toMs(s.endTime) })),
        (s) => s.status,
        elapsedMinutes
    );

    // --- events ---------------------------------------------------------
    const events = [];
    const push = (time, type, text, extra = {}) => events.push({ time, type, text, ...extra });
    const laneLabel = (agentId) => {
        const a = agents.get(agentId);
        const team = a ? teams.get(a.Primary_Department_Id) : null;
        return `${agentName(agentId)}${team ? ` (${team.Department_Name})` : ""}`;
    };

    for (const h of history) {
        const actor = agentName(h.Actor_Agent_Id);
        switch (h.Event_Name) {
            case TICKET_HISTORY_EVENT.CREATED:
                push(h.Event_Time, "CREATED", "Ticket created", { actor: ticket.Channel || "Email" });
                break;
            case TICKET_HISTORY_EVENT.STATUS_CHANGE:
                push(h.Event_Time, "STATUS", `Status changed from ${h.Old_Value || "-"} to ${h.New_Value}`, { actor, clock: clockBehaviourForStatus(orgId, h.New_Value) });
                break;
            case TICKET_HISTORY_EVENT.PRIORITY_CHANGE:
                push(h.Event_Time, "PRIORITY", h.New_Value ? `Priority set to ${h.New_Value}` : "Priority cleared", { actor });
                break;
            case TICKET_HISTORY_EVENT.ASSIGNEE_ADDED: {
                const a = assignments.find((x) => x.Agent_Id === h.New_Value && Math.abs(toMs(x.Assigned_Time) - toMs(h.Event_Time)) < 5000);
                const cross = a?.Is_Cross_Team === "Y";
                push(h.Event_Time, "ASSIGNMENT", `${actor} assigned ${laneLabel(h.New_Value)}${cross ? " - cross-team" : ""}`, { actor, crossTeam: cross, note: a?.Note || null, agentId: h.New_Value });
                break;
            }
            case TICKET_HISTORY_EVENT.ASSIGNEE_REMOVED:
                push(h.Event_Time, "ASSIGNMENT", h.Actor_Agent_Id === h.Old_Value ? `${actor} released themselves` : `${actor} removed ${laneLabel(h.Old_Value)}`, { actor, agentId: h.Old_Value });
                break;
            case TICKET_HISTORY_EVENT.WORK_STATE_CHANGE:
                push(h.Event_Time, "WORK", `${agentName(h.Field_Name)}: ${WORK_STATE_LABEL[h.New_Value] || h.New_Value}`, { actor, state: h.New_Value, agentId: h.Field_Name });
                break;
            case TICKET_HISTORY_EVENT.WORK_UNBLOCKED:
                push(h.Event_Time, "WORK", `${agentName(h.Field_Name)} unblocked - ready to start`, { actor, state: WORK_STATE.READY, agentId: h.Field_Name });
                break;
            case TICKET_HISTORY_EVENT.DEPENDENCY_ADDED:
                push(h.Event_Time, "DEPENDENCY", `${agentName(h.Field_Name)} now waits on ${laneLabel(h.New_Value)}`, { actor, agentId: h.Field_Name });
                break;
            case TICKET_HISTORY_EVENT.DEPENDENCY_REMOVED:
                push(h.Event_Time, "DEPENDENCY", `${agentName(h.Field_Name)} no longer waits on ${agentName(h.Old_Value)}`, { actor, agentId: h.Field_Name });
                break;
            case TICKET_HISTORY_EVENT.WORKLOG_ADDED: {
                const w = worklogs.find((x) => x.Agent_Id === h.Field_Name && Math.abs(toMs(x.Logged_Time) - toMs(h.Event_Time)) < 5000);
                push(h.Event_Time, "WORKLOG", `${agentName(h.Field_Name)} - ${formatMins(Number(h.New_Value) || 0)} work logged`, { actor, note: w?.Note || null, agentId: h.Field_Name });
                break;
            }
            case "FIELD_CHANGE": {
                const label = { Bank_Id: "Bank", Department_Id: "Support team", Product_Id: "Product", Classification: "Classification", Category: "Category", Subject: "Subject" }[h.Field_Name] || h.Field_Name;
                let value = h.New_Value;
                if (h.Field_Name === "Bank_Id") value = h.New_Value ? bankRepository.findById(h.New_Value)?.Bank_Name : null;
                if (h.Field_Name === "Department_Id") value = teams.get(h.New_Value)?.Department_Name;
                if (h.Field_Name === "Description") break;
                push(h.Event_Time, "FIELD", value ? `${label} set to ${value}` : `${label} cleared`, { actor });
                break;
            }
            default:
                break; // COMMENT_ADDED / CONVERSATION_ADDED come from their own rows below
        }
    }
    for (const c of comments) {
        const on = c.Assignment_Id ? assignmentById.get(c.Assignment_Id) : null;
        push(c.Commented_Time, "COMMENT", c.Content, { actor: [c.Commenter_First_Name, c.Commenter_Last_Name].filter(Boolean).join(" ") || "Agent", about: on ? fullName(on) : null });
    }
    for (const conv of conversations) {
        const inbound = conv.Direction === "in";
        const author = inbound
            ? [conv.Author_Contact_First_Name, conv.Author_Contact_Last_Name].filter(Boolean).join(" ") || conv.Author_Contact_Email || "Customer"
            : [conv.Author_Agent_First_Name, conv.Author_Agent_Last_Name].filter(Boolean).join(" ") || "Support";
        push(conv.Sent_Time, "EMAIL", inbound ? `Email received from ${author}` : `Reply sent by ${author}`, { actor: author, inbound });
    }

    events.sort((a, b) => toMs(a.time) - toMs(b.time));
    events.forEach((e, i) => {
        const next = i + 1 < events.length ? toMs(events[i + 1].time) : endMs;
        e.minutesUntilNext = elapsedMinutes(toMs(e.time), next);
    });

    // --- summary --------------------------------------------------------
    const activeIntervals = lanes.flatMap((l) => l.stretches.filter((s) => s.state === WORK_STATE.IN_PROGRESS).map((s) => ({ start: s.start, end: s.end })));
    const ageMinutes = elapsedMinutes(startMs, endMs);
    const busyMinutes = unionMinutes(activeIntervals);

    const perTeam = {};
    const perPerson = {};
    for (const l of lanes) {
        const team = (perTeam[l.teamId || "none"] = perTeam[l.teamId || "none"] || { teamId: l.teamId, teamName: l.teamName, teamType: l.teamType, held: 0, active: 0, waiting: 0, logged: 0 });
        const person = (perPerson[l.agentId] = perPerson[l.agentId] || { agentId: l.agentId, name: l.name, teamName: l.teamName, held: 0, active: 0, waiting: 0, logged: 0 });
        const active = l.byState.IN_PROGRESS?.elapsed || 0;
        const waiting = Object.entries(l.byState).filter(([s]) => WAIT_STATES.has(s)).reduce((sum, [, m]) => sum + m.elapsed, 0);
        for (const bucket of [team, person]) {
            bucket.held += l.held.elapsed;
            bucket.active += active;
            bucket.waiting += waiting;
            bucket.logged += l.loggedMinutes;
        }
    }

    const wait = longestWait({
        laneStretches: lanes.flatMap((l) => l.stretches.map((s) => ({ ...s, laneId: l.assignmentId }))),
        statusStretchList: statuses.map((s) => ({ status: s.status, start: toMs(s.startTime), end: toMs(s.endTime) })),
        clockOf: (status) => clockBehaviourForStatus(orgId, status)
    });
    let longest = null;
    if (wait) {
        if (wait.kind === "WORK") {
            const lane = laneById.get(wait.laneId);
            const blockers = lane.blockedBy.map((id) => laneById.get(id)).filter(Boolean);
            const label =
                wait.state === "WAITING" && blockers.length
                    ? `${lane.name} waiting on ${blockers.map((b) => b.teamName).join(", ")}`
                    : `${lane.name} (${lane.teamName}) - ${WORK_STATE_LABEL[wait.state]}`;
            longest = { ...wait, label, laneId: lane.assignmentId, startTime: new Date(wait.start).toISOString(), endTime: new Date(wait.end).toISOString() };
        } else {
            const label = wait.clock === "PAUSED" ? `Waiting on the bank - ${wait.status}` : `Waiting to be picked up - ${wait.status}`;
            longest = { ...wait, label, startTime: new Date(wait.start).toISOString(), endTime: new Date(wait.end).toISOString() };
        }
    }

    const path = criticalPath(
        lanes.map((l) => ({ id: l.assignmentId, spanMinutes: l.span.elapsed })),
        dependencies.map((d) => ({ from: d.Depends_On_Assignment_Id, to: d.Assignment_Id }))
    );

    return {
        ticketId,
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString(),
        resolved: Boolean(stopped),
        events,
        lanes: lanes.map(({ stretches, ...l }) => ({ ...l, stretches: stretches.map(({ start, end, ...s }) => s) })),
        statuses,
        summary: {
            ageMinutes,
            ageSupportMinutes: supportMinutesBetween(new Date(startMs), new Date(endMs), calendar),
            busyMinutes,
            idleMinutes: Math.max(0, ageMinutes - busyMinutes),
            current: lanes.filter((l) => l.current).map((l) => ({
                assignmentId: l.assignmentId,
                agentId: l.agentId,
                name: l.name,
                teamName: l.teamName,
                crossTeam: l.crossTeam,
                workState: l.workState,
                sinceTime: l.stretches.length ? new Date(l.stretches[l.stretches.length - 1].start).toISOString() : l.assignedTime
            })),
            perTeam: Object.values(perTeam).sort((a, b) => b.held - a.held),
            perPerson: Object.values(perPerson).sort((a, b) => b.held - a.held),
            perStatus: Object.entries(statusTotals).map(([status, minutes]) => ({ status, minutes, clock: clockBehaviourForStatus(orgId, status) })).sort((a, b) => b.minutes - a.minutes),
            longestWait: longest,
            criticalPath: { assignmentIds: path.ids, slowestAssignmentId: path.slowestId, totalMinutes: path.totalMinutes },
            loggedMinutes: worklogs.reduce((sum, w) => sum + w.Minutes, 0)
        },
        worklogs: worklogs.map((w) => ({
            worklogId: w.Worklog_Id,
            assignmentId: w.Assignment_Id,
            agentId: w.Agent_Id,
            name: [w.First_Name, w.Last_Name].filter(Boolean).join(" "),
            minutes: w.Minutes,
            workDate: w.Work_Date,
            note: w.Note,
            loggedBy: w.Logged_By,
            loggedTime: w.Logged_Time
        }))
    };
};

module.exports = { getTracking };
