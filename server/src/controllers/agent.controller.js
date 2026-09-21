const agentService = require("../services/agent.service");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

const listAgents = (req, res, next) => {
    try {
        const agents = agentService.listAgents(req.query);
        ok(res, HTTP_STATUS.OK, agents);
    } catch (error) {
        next(error);
    }
};

const getAgentById = (req, res, next) => {
    try {
        const agent = agentService.getAgentById(req.params.agentId);
        ok(res, HTTP_STATUS.OK, agent);
    } catch (error) {
        next(error);
    }
};

module.exports = { listAgents, getAgentById };
