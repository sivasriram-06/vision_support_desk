const reopenService = require("../services/ticket-reopen.service");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

const handle = (fn) => (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.OK, fn(req));
    } catch (error) {
        next(error);
    }
};

const reopenTicket = handle((req) => reopenService.reopenTicket(req.params.ticketId, req.body, req.agent));
const splitTicket = handle((req) => reopenService.splitTicket(req.params.ticketId, req.agent));
const dismissCloseReplies = handle((req) => reopenService.dismissCloseReplies(req.params.ticketId, req.agent));
const getReopenInfo = handle((req) => reopenService.getReopenInfo(req.params.ticketId));

module.exports = { reopenTicket, splitTicket, dismissCloseReplies, getReopenInfo };
