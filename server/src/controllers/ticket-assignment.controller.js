const assignmentService = require("../services/ticket-assignment.service");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

const listAssignments = (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.OK, assignmentService.listAssignments(req.params.ticketId));
    } catch (error) {
        next(error);
    }
};

const addAssignees = (req, res, next) => {
    try {
        const data = assignmentService.addAssignees(req.params.ticketId, req.body.agentIds, req.agent, { note: req.body.note || null });
        ok(res, HTTP_STATUS.OK, data);
    } catch (error) {
        next(error);
    }
};

const removeAssignee = (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.OK, assignmentService.removeAssignee(req.params.ticketId, req.params.agentId, req.agent));
    } catch (error) {
        next(error);
    }
};

const markSeen = (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.OK, assignmentService.markSeen(req.params.ticketId, req.agent.agentId));
    } catch (error) {
        next(error);
    }
};

const myTickets = (req, res, next) => {
    try {
        const data = assignmentService.myTickets(req.agent, { scope: req.query.scope, includeClosed: req.query.includeClosed === "true" });
        ok(res, HTTP_STATUS.OK, data);
    } catch (error) {
        next(error);
    }
};

const myTicketCounts = (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.OK, assignmentService.myTicketCounts(req.agent));
    } catch (error) {
        next(error);
    }
};

module.exports = { listAssignments, addAssignees, removeAssignee, markSeen, myTickets, myTicketCounts };
