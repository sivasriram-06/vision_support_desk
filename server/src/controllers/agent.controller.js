const agentService = require("../services/agent.service");
const getActorAgentId = require("../utils/get-actor");
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

const createAgent = (req, res, next) => {
    try {
        const agent = agentService.createAgent(req.body, getActorAgentId(req));
        ok(res, HTTP_STATUS.CREATED, agent);
    } catch (error) {
        next(error);
    }
};

const updateAgent = (req, res, next) => {
    try {
        const agent = agentService.updateAgent(req.params.agentId, req.body, getActorAgentId(req));
        ok(res, HTTP_STATUS.OK, agent);
    } catch (error) {
        next(error);
    }
};

const deleteAgent = (req, res, next) => {
    try {
        agentService.deleteAgent(req.params.agentId, getActorAgentId(req));
        ok(res, HTTP_STATUS.OK, { deleted: true });
    } catch (error) {
        next(error);
    }
};

module.exports = { listAgents, getAgentById, createAgent, updateAgent, deleteAgent };
