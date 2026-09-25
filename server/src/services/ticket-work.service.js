const { getDB } = require("../config/db");
const assignmentRepository = require("../repositories/ticket-assignment.repository");
const workRepository = require("../repositories/assignment-work.repository");
const organizationService = require("./organization.service");
const ticketService = require("./ticket.service");
const generateId = require("../utils/generate-id");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const { PERMISSIONS } = require("../constants/permissions");
const { TICKET_HISTORY_EVENT, WORK_STATE } = require("../constants/ticket.constants");

/**
 * One assignee's work on a ticket (an HD_TICKET_ASSIGNMENT row) moves
 * through work states; every stretch is logged so the Tracking tab can
 * show where the ticket sat and who it waited on.
 *
 *   PENDING      assigned, not started (waiting for handover)   - on assign
 *   WAITING      blocked by another assignee's unfinished work  - automatic
 *   READY        unblocked, not started                         - automatic
 *   IN_PROGRESS / ON_HOLD / DONE                                 - set by people
 *
 * When a blocker is marked DONE, everyone waiting only on it moves to
 * READY. Who may change someone's work: the assignee, whoever assigned
 * them, a team lead of the assignee's team or of the ticket's own team
 * (the ticket team lead stays responsible for cross-team work), or
 * anyone with tickets.assign_any.
 */

const MANUAL_STATES = [WORK_STATE.IN_PROGRESS, WORK_STATE.ON_HOLD, WORK_STATE.DONE];
const nowIso = () => new Date().toISOString();
const nameOf = (a) => [a.First_Name, a.Last_Name].filter(Boolean).join(" ");

const badRequest = (message) => new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, message);

const canManageWork = (actor, ticket, assignment) => {
    const has = (key) => actor.permissions.includes(key);
    if (assignment.Agent_Id === actor.agentId || assignment.Assigned_By === actor.agentId) return true;
    if (has(PERMISSIONS.TICKETS_ASSIGN_ANY)) return true;
    return has(PERMISSIONS.TICKETS_ASSIGN_TEAM) && !!actor.teamId &&
        (actor.teamId === assignment.Department_Id || actor.teamId === ticket.Department_Id);
};

const assertCanManage = (actor, ticket, assignment) => {
    if (!canManageWork(actor, ticket, assignment)) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, `Only ${nameOf(assignment)}, whoever assigned them, or a team lead can change this work`);
    }
};

/** The open assignment of `agentId` on the ticket, or 404. */
const getOpenAssignment = (ticketId, agentId) => {
    const open = assignmentRepository.findOpen(ticketId, agentId);
    if (!open) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.AGENT_NOT_FOUND, "This person is not assigned to the ticket");
    }
    return assignmentRepository.findById(open.Assignment_Id);
};

/**
 * Moves an assignment to `state`: closes the current stretch, opens the
 * next, and records history. Runs in the caller's transaction.
 */
const setState = (assignment, state, { actorAgentId, note = null, time = nowIso(), orgId, eventName = TICKET_HISTORY_EVENT.WORK_STATE_CHANGE }) => {
    workRepository.closeOpenStateLog(assignment.Assignment_Id, time);
    workRepository.openStateLog({
        stateLogId: generateId(),
        assignmentId: assignment.Assignment_Id,
        ticketId: assignment.Ticket_Id,
        workState: state,
        startedTime: time,
        actorAgentId,
        note,
        orgId
    });
    assignmentRepository.updateWork(assignment.Assignment_Id, { workState: state });
    ticketService.recordHistory({
        ticketId: assignment.Ticket_Id,
        eventName,
        fieldName: assignment.Agent_Id,
        oldValue: assignment.Work_State,
        newValue: state,
        actorAgentId,
        orgId
    });
};

/** After `assignmentId` finished (or was released), unblock whoever waited only on it. */
const unblockDependents = (assignmentId, { actorAgentId, time, orgId }) => {
    for (const dependentId of workRepository.findDependents(assignmentId)) {
        const dependent = assignmentRepository.findById(dependentId);
        if (!dependent || dependent.Released_Time || dependent.Work_State !== WORK_STATE.WAITING) continue;
        if (workRepository.findOpenBlockers(dependentId).length > 0) continue;
        setState(dependent, WORK_STATE.READY, { actorAgentId, time, orgId, eventName: TICKET_HISTORY_EVENT.WORK_UNBLOCKED, note: "Unblocked" });
    }
};

/** A new assignment starts PENDING (waiting for handover). Called by ticket-assignment.service in its transaction. */
const startWork = (assignmentId, { actorAgentId, time, orgId }) => {
    workRepository.openStateLog({
        stateLogId: generateId(),
        assignmentId,
        ticketId: assignmentRepository.findById(assignmentId).Ticket_Id,
        workState: WORK_STATE.PENDING,
        startedTime: time,
        actorAgentId,
        orgId
    });
};

/** The assignee was released: close their stretch and free anyone waiting on them. */
const endWork = (assignmentId, { actorAgentId, time, orgId }) => {
    workRepository.closeOpenStateLog(assignmentId, time);
    unblockDependents(assignmentId, { actorAgentId, time, orgId });
};

const changeState = (ticketId, agentId, { state, note }, actor) => {
    const org = organizationService.getDefaultOrganization();
    const ticket = ticketService.getTicketById(ticketId);
    const assignment = getOpenAssignment(ticketId, agentId);
    assertCanManage(actor, ticket, assignment);

    if (!MANUAL_STATES.includes(state)) {
        throw badRequest("Work can be set to In progress, On hold or Done - waiting and ready are set automatically");
    }
    if (state === assignment.Work_State) return assignment;
    if (state === WORK_STATE.IN_PROGRESS) {
        const blockers = workRepository.findOpenBlockers(assignment.Assignment_Id);
        if (blockers.length > 0) {
            const names = blockers.map((b) => nameOf(assignmentRepository.findById(b.Assignment_Id))).join(", ");
            throw badRequest(`Still waiting on ${names} - their work must be done first`);
        }
    }

    getDB().transaction(() => {
        const time = nowIso();
        setState(assignment, state, { actorAgentId: actor.agentId, note, time, orgId: org.Organization_Id });
        if (state === WORK_STATE.DONE) unblockDependents(assignment.Assignment_Id, { actorAgentId: actor.agentId, time, orgId: org.Organization_Id });
    })();
    return assignmentRepository.findById(assignment.Assignment_Id);
};

/** Would `from` waiting on `to` create a loop? (Walks what `to` already waits on.) */
const createsCycle = (ticketId, from, to) => {
    const edges = workRepository.findDependenciesByTicketId(ticketId);
    const stack = [to];
    const seen = new Set();
    while (stack.length) {
        const node = stack.pop();
        if (node === from) return true;
        if (seen.has(node)) continue;
        seen.add(node);
        edges.filter((e) => e.Assignment_Id === node).forEach((e) => stack.push(e.Depends_On_Assignment_Id));
    }
    return false;
};

/** `agentId`'s work waits for `blockerAgentId`'s work on this ticket. */
const addDependency = (ticketId, agentId, blockerAgentId, actor) => {
    const org = organizationService.getDefaultOrganization();
    const ticket = ticketService.getTicketById(ticketId);
    const dependent = getOpenAssignment(ticketId, agentId);
    const blocker = getOpenAssignment(ticketId, blockerAgentId);
    assertCanManage(actor, ticket, dependent);
    if (dependent.Assignment_Id === blocker.Assignment_Id) throw badRequest("Someone can't wait on themselves");
    if (createsCycle(ticketId, dependent.Assignment_Id, blocker.Assignment_Id)) {
        throw badRequest(`${nameOf(blocker)} already waits on ${nameOf(dependent)} - that would be a loop`);
    }

    getDB().transaction(() => {
        const time = nowIso();
        try {
            workRepository.insertDependency({
                dependencyId: generateId(),
                ticketId,
                assignmentId: dependent.Assignment_Id,
                dependsOnAssignmentId: blocker.Assignment_Id,
                createdBy: actor.agentId,
                createdTime: time,
                orgId: org.Organization_Id
            });
        } catch (error) {
            if (String(error.code).startsWith("SQLITE_CONSTRAINT")) throw badRequest(`Already waiting on ${nameOf(blocker)}`);
            throw error;
        }
        ticketService.recordHistory({
            ticketId,
            eventName: TICKET_HISTORY_EVENT.DEPENDENCY_ADDED,
            fieldName: dependent.Agent_Id,
            newValue: blocker.Agent_Id,
            actorAgentId: actor.agentId,
            orgId: org.Organization_Id
        });
        const blockerOpen = blocker.Work_State !== WORK_STATE.DONE;
        if (blockerOpen && dependent.Work_State !== WORK_STATE.DONE && dependent.Work_State !== WORK_STATE.WAITING) {
            setState(dependent, WORK_STATE.WAITING, { actorAgentId: actor.agentId, time, orgId: org.Organization_Id, note: `Waiting on ${nameOf(blocker)}` });
        }
    })();
    return assignmentRepository.findById(dependent.Assignment_Id);
};

const removeDependency = (ticketId, agentId, blockerAgentId, actor) => {
    const org = organizationService.getDefaultOrganization();
    const ticket = ticketService.getTicketById(ticketId);
    const dependent = getOpenAssignment(ticketId, agentId);
    const blocker = getOpenAssignment(ticketId, blockerAgentId);
    assertCanManage(actor, ticket, dependent);

    getDB().transaction(() => {
        if (workRepository.deleteDependency(dependent.Assignment_Id, blocker.Assignment_Id) === 0) {
            throw badRequest(`${nameOf(dependent)} is not waiting on ${nameOf(blocker)}`);
        }
        ticketService.recordHistory({
            ticketId,
            eventName: TICKET_HISTORY_EVENT.DEPENDENCY_REMOVED,
            fieldName: dependent.Agent_Id,
            oldValue: blocker.Agent_Id,
            actorAgentId: actor.agentId,
            orgId: org.Organization_Id
        });
        if (dependent.Work_State === WORK_STATE.WAITING && workRepository.findOpenBlockers(dependent.Assignment_Id).length === 0) {
            setState(dependent, WORK_STATE.READY, { actorAgentId: actor.agentId, orgId: org.Organization_Id, eventName: TICKET_HISTORY_EVENT.WORK_UNBLOCKED, note: "Unblocked" });
        }
    })();
    return assignmentRepository.findById(dependent.Assignment_Id);
};

/** Log effort against an assignment. Anyone who may manage that work may log it (e.g. a lead for a product member). */
const addWorklog = (ticketId, agentId, { minutes, workDate, note }, actor) => {
    const org = organizationService.getDefaultOrganization();
    const ticket = ticketService.getTicketById(ticketId);
    const assignment = getOpenAssignment(ticketId, agentId);
    assertCanManage(actor, ticket, assignment);

    const worklogId = generateId();
    getDB().transaction(() => {
        workRepository.insertWorklog({
            Worklog_Id: worklogId,
            Ticket_Id: ticketId,
            Assignment_Id: assignment.Assignment_Id,
            Agent_Id: assignment.Agent_Id,
            Minutes: minutes,
            Work_Date: workDate || nowIso().slice(0, 10),
            Note: note || null,
            Logged_By: actor.agentId,
            Logged_Time: nowIso(),
            Org_Id: org.Organization_Id
        });
        ticketService.recordHistory({
            ticketId,
            eventName: TICKET_HISTORY_EVENT.WORKLOG_ADDED,
            fieldName: assignment.Agent_Id,
            newValue: minutes,
            actorAgentId: actor.agentId,
            orgId: org.Organization_Id
        });
    })();
    return workRepository.findWorklogById(worklogId);
};

/** Only whoever logged the entry may remove it. */
const deleteWorklog = (ticketId, worklogId, actor) => {
    const worklog = workRepository.findWorklogById(worklogId);
    if (!worklog || worklog.Ticket_Id !== ticketId) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.VALIDATION_ERROR, "Work log not found");
    }
    if (worklog.Logged_By !== actor.agentId) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, "You can only remove work you logged");
    }
    workRepository.softDeleteWorklog(worklogId);
};

module.exports = {
    canManageWork,
    startWork,
    endWork,
    changeState,
    addDependency,
    removeDependency,
    addWorklog,
    deleteWorklog
};
