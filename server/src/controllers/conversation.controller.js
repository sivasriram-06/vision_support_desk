const conversationService = require("../services/conversation.service");
const getActorAgentId = require("../utils/get-actor");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

const listConversations = (req, res, next) => {
    try {
        const conversations = conversationService.listByTicket(req.params.ticketId);
        ok(res, HTTP_STATUS.OK, conversations);
    } catch (error) {
        next(error);
    }
};

const addReply = (req, res, next) => {
    try {
        const reply = conversationService.addReply(req.params.ticketId, req.body, getActorAgentId(req));
        ok(res, HTTP_STATUS.CREATED, reply);
    } catch (error) {
        next(error);
    }
};

const listComments = (req, res, next) => {
    try {
        const comments = conversationService.listComments(req.params.ticketId);
        ok(res, HTTP_STATUS.OK, comments);
    } catch (error) {
        next(error);
    }
};

const addComment = (req, res, next) => {
    try {
        const comment = conversationService.addComment(req.params.ticketId, req.body, getActorAgentId(req));
        ok(res, HTTP_STATUS.CREATED, comment);
    } catch (error) {
        next(error);
    }
};

module.exports = { listConversations, addReply, listComments, addComment };
