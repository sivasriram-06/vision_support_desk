const { getDB } = require("../config/db");
const assignmentRepository = require("../repositories/ticket-assignment.repository");
const agentRepository = require("../repositories/agent.repository");
const ticketRepository = require("../repositories/ticket.repository");
const picklistRepository = require("../repositories/picklist.repository");
const organizationService = require("./organization.service");
const ticketService = require("./ticket.service");
const workService = require("./ticket-work.service");
const generateId = require("../utils/generate-id");
const DB_TABLES = require("../constants/db-tables");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const { PERMISSIONS } = require("../constants/permissions");
const { PICKLIST_FIELD } = require("../constants/picklist.constants");
const { TICKET_HISTORY_EVENT, NEW_EMAIL_TICKET_STATUS } = require("../constants/ticket.constants");

// Equal assignees per ticket; leads make the first assignment, then assignees may bring anyone in. All logged.

const { publish, REALTIME_EVENT } = require("../realtime/bus");
const { nowIst } = require("../utils/time");

// Ticket/queues refresh for all; My Tickets for everyone ever assigned, their assigners and the actor.
const publishAssignmentChange = (ticketId, actorAgentId, extraAgentIds = []) => {
    const rows = assignmentRepository.findByTicketId(ticketId);
    const agents = [actorAgentId, ...extraAgentIds, ...rows.map((a) => a.Agent_Id), ...rows.map((a) => a.Assigned_By)];
    publish({ type: REALTIME_EVENT.TICKET_ASSIGNMENT, ticketId, actorAgentId });
    publish({ type: REALTIME_EVENT.MY_TICKETS_CHANGED, ticketId }, { toAgents: agents });
};

const forbidden = (message) => new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, message);
const nowIso = () => nowIst();

const getAgent = (agentId) => {
    // Directory row: includes the team's Team_Type for the assign rules.
    const agent = agentRepository.findDirectoryById(agentId);
    if (!agent) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.AGENT_NOT_FOUND, "Agent not found");
    }
    return agent;
};

const isCrossTeam = (ticket, agent) => !agent.Primary_Department_Id || agent.Primary_Department_Id !== ticket.Department_Id;

// Leads (assign_any / assign_team) always can; otherwise only someone already assigned can bring others in.
const assertCanAssign = (actor, ticketId) => {
    const has = (key) => actor.permissions.includes(key);
    if (has(PERMISSIONS.TICKETS_ASSIGN_ANY) || has(PERMISSIONS.TICKETS_ASSIGN_TEAM)) return;
    if (!has(PERMISSIONS.TICKETS_EDIT_STATUS)) {
        throw forbidden("You do not have permission to assign this ticket");
    }
    if (assignmentRepository.findOpen(ticketId, actor.agentId)) return;
    if (assignmentRepository.countOpen(ticketId) === 0) {
        throw forbidden("The first assignment is made by a team lead or manager - ask your team lead");
    }
    throw forbidden("Only people assigned to this ticket can bring others in");
};

// Release: the assignee, their assigner, assign_any, or a team lead of the ticket's or the assignee's team.
const assertCanRelease = (actor, ticket, agent, assignment) => {
    if (agent.Agent_Id === actor.agentId || assignment.Assigned_By === actor.agentId) return;
    const has = (key) => actor.permissions.includes(key);
    if (has(PERMISSIONS.TICKETS_ASSIGN_ANY)) return;
    if (has(PERMISSIONS.TICKETS_ASSIGN_TEAM) && actor.teamId &&
        (ticket.Department_Id === actor.teamId || agent.Primary_Department_Id === actor.teamId)) return;
    throw forbidden("Only the assignee, whoever assigned them, or a team lead of this ticket's team can remove them");
};

// First assignee moves an intake ticket to "Open" so an assigned ticket never reads "Unassigned".
const promoteFromIntake = (ticket, actorAgentId, orgId) => {
    if (ticket.Status !== NEW_EMAIL_TICKET_STATUS) return;
    if (!picklistRepository.findByValue(orgId, PICKLIST_FIELD.STATUS, "Open")) return;
    ticketService.updateTicket(ticket.Ticket_Id, { status: "Open" }, actorAgentId);
};

const addAssignees = (ticketId, agentIds, actor, { note = null } = {}) => {
    const org = organizationService.getDefaultOrganization();
    const ticket = ticketService.getTicketById(ticketId);
    const agents = [...new Set(agentIds)].map(getAgent);

    for (const agent of agents) {
        if (agent.Status !== "Active") {
            throw forbidden(`${agent.First_Name} ${agent.Last_Name} is inactive and can't be assigned`);
        }
        assertCanAssign(actor, ticketId);
    }

    getDB().transaction(() => {
        const hadAssignees = assignmentRepository.countOpen(ticketId) > 0;
        const time = nowIso();
        for (const agent of agents) {
            if (assignmentRepository.findOpen(ticketId, agent.Agent_Id)) continue;
            // A team already on the ticket keeps its round; a team coming back starts the next round.
            const teamId = agent.Primary_Department_Id || null;
            const roundNo = assignmentRepository.findOpenTeamRound(ticketId, teamId) || assignmentRepository.countTeamRounds(ticketId, teamId) + 1;
            const assignmentId = generateId(DB_TABLES.TICKET_ASSIGNMENT);
            assignmentRepository.insert({
                Assignment_Id: assignmentId,
                Ticket_Id: ticketId,
                Agent_Id: agent.Agent_Id,
                Department_Id: teamId,
                Is_Cross_Team: isCrossTeam(ticket, agent) ? "Y" : "N",
                Assigned_By: actor.agentId,
                Assigned_Time: time,
                Note: note,
                Round_No: roundNo,
                Seen_Time: agent.Agent_Id === actor.agentId ? time : null,
                Org_Id: org.Organization_Id
            });
            workService.startWork(assignmentId, { actorAgentId: actor.agentId, time, orgId: org.Organization_Id });
            ticketService.recordHistory({
                ticketId,
                eventName: TICKET_HISTORY_EVENT.ASSIGNEE_ADDED,
                fieldName: "Assignee",
                newValue: agent.Agent_Id,
                actorAgentId: actor.agentId,
                orgId: org.Organization_Id
            });
        }
        if (!hadAssignees) promoteFromIntake(ticket, actor.agentId, org.Organization_Id);
        ticketRepository.updateById(ticketId, { Modified_By: actor.agentId });
    })();
    publishAssignmentChange(ticketId, actor.agentId);
    return listAssignments(ticketId);
};

const removeAssignee = (ticketId, agentId, actor) => {
    const org = organizationService.getDefaultOrganization();
    const ticket = ticketService.getTicketById(ticketId);
    const open = assignmentRepository.findOpen(ticketId, agentId);
    if (!open) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.AGENT_NOT_FOUND, "This person is not assigned to the ticket");
    }
    assertCanRelease(actor, ticket, getAgent(agentId), open);

    getDB().transaction(() => {
        const time = nowIso();
        assignmentRepository.release(open.Assignment_Id, actor.agentId, time);
        workService.endWork(open.Assignment_Id, { actorAgentId: actor.agentId, time, orgId: org.Organization_Id });
        ticketService.recordHistory({
            ticketId,
            eventName: TICKET_HISTORY_EVENT.ASSIGNEE_REMOVED,
            fieldName: "Assignee",
            oldValue: agentId,
            actorAgentId: actor.agentId,
            orgId: org.Organization_Id
        });
        ticketRepository.updateById(ticketId, { Modified_By: actor.agentId });
    })();
    publishAssignmentChange(ticketId, actor.agentId, [agentId]);
    return listAssignments(ticketId);
};

/** Current and past assignments of a ticket (tracking + panel). */
const listAssignments = (ticketId) => {
    ticketService.getTicketById(ticketId);
    return assignmentRepository.findByTicketId(ticketId);
};

/** The assignee opened the ticket - clears its "new" flag on My Tickets. */
const markSeen = (ticketId, agentId) => {
    const updated = assignmentRepository.markSeen(ticketId, agentId, nowIso()) > 0;
    // Only the viewer's own badge changes.
    if (updated) publish({ type: REALTIME_EVENT.MY_TICKETS_CHANGED, ticketId }, { toAgents: [agentId] });
    return { updated };
};

const myTickets = (actor, { scope = "assigned", includeClosed = false } = {}) => {
    const org = organizationService.getDefaultOrganization();
    if (scope === "team" && !actor.teamId) return [];
    return ticketRepository.findMyTickets(org.Organization_Id, {
        scope,
        agentId: actor.agentId,
        teamId: actor.teamId,
        includeClosed
    });
};

const myTicketCounts = (actor, { includeClosed = false } = {}) => {
    const org = organizationService.getDefaultOrganization();
    return ticketRepository.countMyTickets(org.Organization_Id, { agentId: actor.agentId, teamId: actor.teamId, includeClosed });
};

module.exports = { addAssignees, removeAssignee, listAssignments, markSeen, myTickets, myTicketCounts };
