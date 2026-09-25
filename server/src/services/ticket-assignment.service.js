const { getDB } = require("../config/db");
const assignmentRepository = require("../repositories/ticket-assignment.repository");
const agentRepository = require("../repositories/agent.repository");
const ticketRepository = require("../repositories/ticket.repository");
const picklistRepository = require("../repositories/picklist.repository");
const organizationService = require("./organization.service");
const ticketService = require("./ticket.service");
const workService = require("./ticket-work.service");
const generateId = require("../utils/generate-id");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const { PERMISSIONS } = require("../constants/permissions");
const { PICKLIST_FIELD } = require("../constants/picklist.constants");
const { TICKET_HISTORY_EVENT, NEW_EMAIL_TICKET_STATUS } = require("../constants/ticket.constants");

/**
 * Who works a ticket. A ticket has any number of equal assignees
 * (HD_TICKET_ASSIGNMENT). Rules:
 *
 *   Support team member   - assignee's team is a Support team (or has no
 *                           type, e.g. the intake team): tickets.assign_any,
 *                           or tickets.assign_team for members of the
 *                           actor's own team (team lead). A team member
 *                           can't assign themselves or a teammate.
 *   Product / other team  - assignee's team type is anything but Support
 *                           (e.g. Java or Angular Team): anyone who works
 *                           tickets (tickets.edit_status) may pull them in.
 *   Is_Cross_Team marks an assignee outside the ticket's own team.
 *   Release               - the assignee themselves, whoever assigned them,
 *                           or someone allowed to assign them.
 *
 * Every add/release writes a history row, so ticket tracking can show who
 * assigned whom and when.
 */

const forbidden = (message) => new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, message);
const nowIso = () => new Date().toISOString();

const getAgent = (agentId) => {
    // Directory row: includes the team's Team_Type for the assign rules.
    const agent = agentRepository.findDirectoryById(agentId);
    if (!agent) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.AGENT_NOT_FOUND, "Agent not found");
    }
    return agent;
};

const isCrossTeam = (ticket, agent) => !agent.Primary_Department_Id || agent.Primary_Department_Id !== ticket.Department_Id;

// Support teams (and teams without a type, e.g. the intake team) are
// assigned by their team lead. Any other team type (Product: Java,
// Angular...) can be pulled in by anyone working the ticket.
const SUPPORT_TEAM_TYPE = "Support";
const isOpenToEveryone = (agent) => !!agent.Team_Type && agent.Team_Type !== SUPPORT_TEAM_TYPE;

/** Can `actor` assign `agent` to `ticket`? Throws with the reason if not. */
const assertCanAssign = (actor, ticket, agent) => {
    const has = (key) => actor.permissions.includes(key);
    if (has(PERMISSIONS.TICKETS_ASSIGN_ANY)) return;

    if (isOpenToEveryone(agent)) {
        if (!has(PERMISSIONS.TICKETS_EDIT_STATUS)) {
            throw forbidden("You do not have permission to pull another team into this ticket");
        }
        return;
    }
    if (!has(PERMISSIONS.TICKETS_ASSIGN_TEAM)) {
        throw forbidden("Only a team lead can assign support team members - ask your team lead");
    }
    if (!actor.teamId || agent.Primary_Department_Id !== actor.teamId) {
        throw forbidden("You can only assign members of your own team");
    }
};

/**
 * First assignee on a ticket still sitting in the intake status moves it
 * to "Open" (when that status exists), so an assigned ticket never reads
 * "Unassigned".
 */
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
        assertCanAssign(actor, ticket, agent);
    }

    getDB().transaction(() => {
        const hadAssignees = assignmentRepository.countOpen(ticketId) > 0;
        const time = nowIso();
        for (const agent of agents) {
            if (assignmentRepository.findOpen(ticketId, agent.Agent_Id)) continue;
            // A team already on the ticket keeps its round; a team coming
            // back after leaving starts the next round.
            const teamId = agent.Primary_Department_Id || null;
            const roundNo = assignmentRepository.findOpenTeamRound(ticketId, teamId) || assignmentRepository.countTeamRounds(ticketId, teamId) + 1;
            const assignmentId = generateId();
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
                // Assigning yourself needs no "new" flag.
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
    return listAssignments(ticketId);
};

const removeAssignee = (ticketId, agentId, actor) => {
    const org = organizationService.getDefaultOrganization();
    const ticket = ticketService.getTicketById(ticketId);
    const open = assignmentRepository.findOpen(ticketId, agentId);
    if (!open) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.AGENT_NOT_FOUND, "This person is not assigned to the ticket");
    }
    const self = agentId === actor.agentId;
    const assigner = open.Assigned_By === actor.agentId;
    if (!self && !assigner) assertCanAssign(actor, ticket, getAgent(agentId));

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
    return listAssignments(ticketId);
};

/** Current and past assignments of a ticket (tracking + panel). */
const listAssignments = (ticketId) => {
    ticketService.getTicketById(ticketId);
    return assignmentRepository.findByTicketId(ticketId);
};

/** The assignee opened the ticket - clears its "new" flag on My Tickets. */
const markSeen = (ticketId, agentId) => ({ updated: assignmentRepository.markSeen(ticketId, agentId, nowIso()) > 0 });

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

const myTicketCounts = (actor) => {
    const org = organizationService.getDefaultOrganization();
    return ticketRepository.countMyTickets(org.Organization_Id, { agentId: actor.agentId, teamId: actor.teamId });
};

module.exports = { addAssignees, removeAssignee, listAssignments, markSeen, myTickets, myTicketCounts };
