const ticketService = require("../services/ticket.service");
const ticketAccessService = require("../services/ticket-access.service");
const getActorAgentId = require("../utils/get-actor");
const HTTP_STATUS = require("../constants/http-status");
const { okList, ok } = require("../utils/api-response");

const listTickets = (req, res, next) => {
    try {
        const { data, paging } = ticketService.listTickets(req.query);
        okList(res, HTTP_STATUS.OK, data, paging);
    } catch (error) {
        next(error);
    }
};

const getAgentQueue = (req, res, next) => {
    try {
        const { data, paging } = ticketService.getAgentQueue(req.params.agentId, req.query);
        okList(res, HTTP_STATUS.OK, data, paging);
    } catch (error) {
        next(error);
    }
};

const getBankQueue = (req, res, next) => {
    try {
        const { data, paging } = ticketService.getBankQueue(req.params.bankId, req.query);
        okList(res, HTTP_STATUS.OK, data, paging);
    } catch (error) {
        next(error);
    }
};

const getTicketById = (req, res, next) => {
    try {
        const ticket = ticketService.getTicketDetail(req.params.ticketId);
        ok(res, HTTP_STATUS.OK, ticket);
    } catch (error) {
        next(error);
    }
};

const createTicket = (req, res, next) => {
    try {
        const ticket = ticketService.createTicket(req.body, getActorAgentId(req));
        ok(res, HTTP_STATUS.CREATED, ticket);
    } catch (error) {
        next(error);
    }
};

const updateTicket = (req, res, next) => {
    try {
        const existing = ticketService.getTicketById(req.params.ticketId);
        ticketAccessService.assertCanUpdateTicket(req.agent, existing, req.body);
        const ticket = ticketService.updateTicket(req.params.ticketId, req.body, getActorAgentId(req));
        ok(res, HTTP_STATUS.OK, ticket);
    } catch (error) {
        next(error);
    }
};

const getTicketHistory = (req, res, next) => {
    try {
        const history = ticketService.getTicketHistory(req.params.ticketId);
        ok(res, HTTP_STATUS.OK, history);
    } catch (error) {
        next(error);
    }
};

const getTicketResolution = (req, res, next) => {
    try {
        const resolution = ticketService.getTicketResolution(req.params.ticketId);
        ok(res, HTTP_STATUS.OK, resolution);
    } catch (error) {
        next(error);
    }
};

const getTicketMetrics = (req, res, next) => {
    try {
        const metrics = ticketService.getTicketMetrics(req.params.ticketId);
        ok(res, HTTP_STATUS.OK, metrics);
    } catch (error) {
        next(error);
    }
};

const listEscalatedTickets = (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.OK, ticketService.listEscalatedTickets(req.query));
    } catch (error) {
        next(error);
    }
};

module.exports = {
    listTickets,
    listEscalatedTickets,
    getAgentQueue,
    getBankQueue,
    getTicketById,
    createTicket,
    updateTicket,
    getTicketHistory,
    getTicketResolution,
    getTicketMetrics
};
