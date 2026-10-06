const { getDB } = require("../config/db");
const ticketRepository = require("../repositories/ticket.repository");
const assignmentRepository = require("../repositories/ticket-assignment.repository");
const reopenRepository = require("../repositories/ticket-reopen.repository");
const { conversation: conversationRepository } = require("../repositories/conversation.repository");
const { metrics: metricsRepository } = require("../repositories/history.repository");
const organizationService = require("./organization.service");
const ticketService = require("./ticket.service");
const workService = require("./ticket-work.service");
const resolutionClock = require("./sla/resolution-clock.service");
const escalationService = require("./sla/escalation.service");
const { computeSlaDueDate } = require("./sla/sla.service");
const generateId = require("../utils/generate-id");
const DB_TABLES = require("../constants/db-tables");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const { PERMISSIONS } = require("../constants/permissions");
const {
    CHANNEL,
    CLOCK_BEHAVIOUR,
    NEW_EMAIL_TICKET_STATUS,
    POST_CLOSE_DECISION,
    TICKET_HISTORY_EVENT
} = require("../constants/ticket.constants");

// Mail on a Closed ticket waits for a lead: Reopen (fresh SLA), New issue (split from that mail) or No action.

const { publish, REALTIME_EVENT } = require("../realtime/bus");
const { nowIst } = require("../utils/time");

const nowIso = () => nowIst();
const badRequest = (message) => new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, message);

const assertCanDecide = (actor) => {
    if (!actor.permissions.includes(PERMISSIONS.TICKETS_REOPEN)) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, "Only a team lead or manager can reopen or split a closed ticket");
    }
};

const getClosedTicket = (ticketId) => {
    const ticket = ticketService.getTicketById(ticketId);
    if (ticket.Clock_State !== CLOCK_BEHAVIOUR.STOPPED) {
        throw badRequest("This ticket is not Closed");
    }
    return ticket;
};

const stripReplyPrefix = (subject) => (subject || "").replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "").trim();

const reopenTicket = (ticketId, { reason }, actor) => {
    assertCanDecide(actor);
    const org = organizationService.getDefaultOrganization();
    const orgId = org.Organization_Id;
    const ticket = getClosedTicket(ticketId);
    if (!reason || !reason.trim()) throw badRequest("Give a reason for reopening");

    getDB().transaction(() => {
        const time = nowIso();
        const pending = conversationRepository.findPendingCloseReplies(ticketId);
        const reopenNo = reopenRepository.countByTicketId(ticketId) + 1;
        const due = ticket.Response_Due_Date;
        const closed = ticket.Closed_Time || ticket.Resolved_Time;

        reopenRepository.insert({
            Reopen_Id: generateId(DB_TABLES.TICKET_REOPEN),
            Ticket_Id: ticketId,
            Reopen_No: reopenNo,
            Reason: reason.trim(),
            Trigger_Conversation_Id: pending.length ? pending[pending.length - 1].Conversation_Id : null,
            Reopened_By: actor.agentId,
            Reopened_Time: time,
            Prev_Closed_Time: closed || null,
            Prev_Due_Date: due || null,
            Prev_Sla_Met: due && closed ? (closed <= due ? "Y" : "N") : null,
            Org_Id: orgId
        });
        conversationRepository.decidePendingCloseReplies(ticketId, POST_CLOSE_DECISION.REOPENED, actor.agentId);

        // Reopens unassigned: last round's people are released; the lead assigns again.
        for (const a of assignmentRepository.findByTicketId(ticketId).filter((x) => !x.Released_Time)) {
            assignmentRepository.release(a.Assignment_Id, actor.agentId, time);
            workService.endWork(a.Assignment_Id, { actorAgentId: actor.agentId, time, orgId });
            ticketService.recordHistory({
                ticketId, eventName: TICKET_HISTORY_EVENT.ASSIGNEE_REMOVED, fieldName: "Assignee",
                oldValue: a.Agent_Id, actorAgentId: actor.agentId, orgId, eventTime: time
            });
        }

        const changes = resolutionClock.applyStatusChange({
            ticket, newStatus: NEW_EMAIL_TICKET_STATUS, bankId: ticket.Bank_Id, actorAgentId: actor.agentId, orgId
        });
        // Fresh SLA from the reopen time.
        changes.Status = NEW_EMAIL_TICKET_STATUS;
        changes.Sla_Start_Time = time;
        changes.Response_Due_Date = computeSlaDueDate({ createdTime: time, priority: ticket.Priority, bankId: ticket.Bank_Id, orgId });
        changes.Modified_By = actor.agentId;
        const updated = ticketRepository.updateById(ticketId, changes);
        escalationService.rebuildTriggers(updated, orgId);

        const metrics = metricsRepository.findMetricsByTicketId(ticketId);
        if (metrics) metricsRepository.updateById(metrics.Metric_Id, { Reopen_Count: reopenNo, Modified_By: actor.agentId });

        ticketService.recordHistory({
            ticketId, eventName: TICKET_HISTORY_EVENT.REOPENED, fieldName: "Reopen",
            newValue: reopenNo, actorAgentId: actor.agentId, orgId, eventTime: time
        });
        ticketService.recordHistory({
            ticketId, eventName: TICKET_HISTORY_EVENT.STATUS_CHANGE, fieldName: "Status",
            oldValue: ticket.Status, newValue: NEW_EMAIL_TICKET_STATUS, actorAgentId: actor.agentId, orgId, eventTime: time
        });
    })();
    return ticketService.getTicketDetail(ticketId);
};

const splitTicket = (ticketId, actor) => {
    assertCanDecide(actor);
    const org = organizationService.getDefaultOrganization();
    const orgId = org.Organization_Id;
    const ticket = getClosedTicket(ticketId);
    const pending = conversationRepository.findPendingCloseReplies(ticketId);
    if (pending.length === 0) throw badRequest("There is no customer reply after close to create a new issue from");
    const first = pending[0];

    const newTicketId = getDB().transaction(() => {
        const created = ticketService.createTicket({
            subject: stripReplyPrefix(first.Subject) || ticket.Subject,
            description: first.Content,
            channel: ticket.Channel || CHANNEL.EMAIL,
            status: NEW_EMAIL_TICKET_STATUS,
            departmentId: ticket.Department_Id,
            bankId: ticket.Bank_Id,
            contactId: first.Author_Contact_Id || ticket.Contact_Id,
            priority: ticket.Priority,
            classification: ticket.Classification,
            category: ticket.Category,
            subCategory: ticket.Sub_Category,
            productId: ticket.Product_Id,
            createdTime: first.Sent_Time,
            splitFromTicketId: ticketId
        }, actor.agentId);

        conversationRepository.decidePendingCloseReplies(ticketId, POST_CLOSE_DECISION.SPLIT, actor.agentId);
        const moved = conversationRepository.moveFromTime(ticketId, created.Ticket_Id, first.Sent_Time, actor.agentId);
        if (moved.threads) {
            ticketRepository.incrementCounter(ticketId, "Thread_Count", -moved.threads, actor.agentId);
            ticketRepository.incrementCounter(created.Ticket_Id, "Thread_Count", moved.threads, actor.agentId);
        }
        if (moved.attachments) {
            ticketRepository.incrementCounter(ticketId, "Attachment_Count", -moved.attachments, actor.agentId);
            ticketRepository.incrementCounter(created.Ticket_Id, "Attachment_Count", moved.attachments, actor.agentId);
        }

        const time = nowIso();
        ticketService.recordHistory({
            ticketId, eventName: TICKET_HISTORY_EVENT.SPLIT_TO, fieldName: "Split",
            newValue: created.Ticket_Id, actorAgentId: actor.agentId, orgId, eventTime: time
        });
        ticketService.recordHistory({
            ticketId: created.Ticket_Id, eventName: TICKET_HISTORY_EVENT.SPLIT_FROM, fieldName: "Split",
            newValue: ticketId, actorAgentId: actor.agentId, orgId, eventTime: time
        });
        return created.Ticket_Id;
    })();
    return ticketService.getTicketDetail(newTicketId);
};

const dismissCloseReplies = (ticketId, actor) => {
    assertCanDecide(actor);
    const org = organizationService.getDefaultOrganization();
    getClosedTicket(ticketId);
    getDB().transaction(() => {
        const cleared = conversationRepository.decidePendingCloseReplies(ticketId, POST_CLOSE_DECISION.DISMISSED, actor.agentId);
        if (cleared === 0) throw badRequest("There is no customer reply after close waiting for a decision");
        ticketService.recordHistory({
            ticketId, eventName: TICKET_HISTORY_EVENT.CLOSE_REPLY_DISMISSED, fieldName: "Reply after close",
            newValue: cleared, actorAgentId: actor.agentId, orgId: org.Organization_Id
        });
    })();
    return ticketService.getTicketDetail(ticketId);
};

/** Reopen rounds and split links for the ticket page and Tracking tab. */
const getReopenInfo = (ticketId) => {
    const ticket = ticketService.getTicketById(ticketId);
    return {
        reopens: reopenRepository.findByTicketId(ticketId).map((r) => ({
            reopenNo: r.Reopen_No,
            reason: r.Reason,
            reopenedBy: r.Reopened_By,
            reopenedByName: [r.Reopened_By_First_Name, r.Reopened_By_Last_Name].filter(Boolean).join(" "),
            reopenedTime: r.Reopened_Time,
            prevClosedTime: r.Prev_Closed_Time,
            prevDueDate: r.Prev_Due_Date,
            prevSlaMet: r.Prev_Sla_Met === null ? null : r.Prev_Sla_Met === "Y",
            closedAgainTime: r.Closed_Again_Time,
            triggerConversationId: r.Trigger_Conversation_Id
        })),
        splitInto: ticketRepository.findSplitChildren(ticketId),
        splitFrom: ticket.Split_From_Ticket_Id
            ? (({ Ticket_Id, Ticket_Number, Subject }) => ({ Ticket_Id, Ticket_Number, Subject }))(ticketService.getTicketById(ticket.Split_From_Ticket_Id))
            : null
    };
};

// Decisions refresh ticket and lists; a reopen releases people so their My Tickets refresh too.
const publishingDecision = (fn, reason) => (ticketId, ...args) => {
    const result = fn(ticketId, ...args);
    const actor = args[args.length - 1];
    publish({ type: REALTIME_EVENT.TICKET_REOPEN, ticketId, reason, actorAgentId: actor?.agentId });
    if (reason === "reopen") {
        const people = assignmentRepository.findByTicketId(ticketId).map((x) => x.Agent_Id);
        publish({ type: REALTIME_EVENT.MY_TICKETS_CHANGED, ticketId }, { toAgents: [actor?.agentId, ...people] });
    }
    return result;
};

module.exports = {
    reopenTicket: publishingDecision(reopenTicket, "reopen"),
    splitTicket: publishingDecision(splitTicket, "split"),
    dismissCloseReplies: publishingDecision(dismissCloseReplies, "no-action"),
    getReopenInfo
};
