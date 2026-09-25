const { getDB } = require("../config/db");
const { conversation: conversationRepository, comment: commentRepository } = require("../repositories/conversation.repository");
const ticketRepository = require("../repositories/ticket.repository");
const ticketService = require("./ticket.service");
const organizationService = require("./organization.service");
const generateId = require("../utils/generate-id");
const { DIRECTION, TICKET_HISTORY_EVENT } = require("../constants/ticket.constants");

const nowIso = () => new Date().toISOString();

const listByTicket = (ticketId) => {
    ticketService.getTicketById(ticketId);
    return conversationRepository.findByTicketId(ticketId);
};

/**
 * Agent reply on a ticket (POST /api/v1/tickets/{id}/conversations).
 * Increments the ticket's Thread_Count and writes a history row in the same
 * transaction as the conversation insert.
 */
const addReply = (ticketId, payload, actorAgentId) => {
    ticketService.getTicketById(ticketId);
    const org = organizationService.getDefaultOrganization();

    const db = getDB();
    const txn = db.transaction(() => {
        const conversationId = generateId();
        conversationRepository.insert({
            Conversation_Id: conversationId,
            Ticket_Id: ticketId,
            Direction: DIRECTION.OUT,
            Channel: payload.channel || "Email",
            Content: payload.content,
            Author_Agent_Id: actorAgentId,
            Is_Public: payload.isPublic === false ? "N" : "Y",
            To_Address: payload.toAddress || null,
            Cc_Address: payload.ccAddress || null,
            Sent_Time: nowIso(),
            Created_By: actorAgentId,
            Org_Id: org.Organization_Id
        });

        ticketRepository.incrementCounter(ticketId, "Thread_Count");
        ticketService.recordHistory({
            ticketId,
            eventName: TICKET_HISTORY_EVENT.CONVERSATION_ADDED,
            actorAgentId,
            orgId: org.Organization_Id
        });

        return conversationId;
    });

    const conversationId = txn();
    return conversationRepository.findById(conversationId);
};

const listComments = (ticketId) => {
    ticketService.getTicketById(ticketId);
    return commentRepository.findCommentsByTicketId(ticketId);
};

const addComment = (ticketId, payload, actorAgentId) => {
    ticketService.getTicketById(ticketId);
    const org = organizationService.getDefaultOrganization();

    const db = getDB();
    const txn = db.transaction(() => {
        const commentId = generateId();
        commentRepository.insert({
            Comment_Id: commentId,
            Ticket_Id: ticketId,
            Commenter_Agent_Id: actorAgentId,
            Content: payload.content,
            Assignment_Id: payload.assignmentId || null,
            Commented_Time: nowIso(),
            Created_By: actorAgentId,
            Org_Id: org.Organization_Id
        });

        ticketRepository.incrementCounter(ticketId, "Comment_Count");
        ticketService.recordHistory({
            ticketId,
            eventName: TICKET_HISTORY_EVENT.COMMENT_ADDED,
            actorAgentId,
            orgId: org.Organization_Id
        });

        return commentId;
    });

    const commentId = txn();
    return commentRepository.findById(commentId);
};

module.exports = { listByTicket, addReply, listComments, addComment };
