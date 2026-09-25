const workService = require("../services/ticket-work.service");
const trackingService = require("../services/tracking/ticket-tracking.service");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

const handle = (fn) => (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.OK, fn(req));
    } catch (error) {
        next(error);
    }
};

const getTracking = handle((req) => trackingService.getTracking(req.params.ticketId));
const changeState = handle((req) => workService.changeState(req.params.ticketId, req.params.agentId, req.body, req.agent));
const addDependency = handle((req) => workService.addDependency(req.params.ticketId, req.params.agentId, req.body.blockerAgentId, req.agent));
const removeDependency = handle((req) => workService.removeDependency(req.params.ticketId, req.params.agentId, req.params.blockerAgentId, req.agent));
const addWorklog = handle((req) => workService.addWorklog(req.params.ticketId, req.params.agentId, req.body, req.agent));
const deleteWorklog = handle((req) => {
    workService.deleteWorklog(req.params.ticketId, req.params.worklogId, req.agent);
    return { deleted: true };
});

module.exports = { getTracking, changeState, addDependency, removeDependency, addWorklog, deleteWorklog };
