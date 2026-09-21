const agentRepository = require("../repositories/agent.repository");
const organizationService = require("./organization.service");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");

const listAgents = (query) => {
    const org = organizationService.getDefaultOrganization();
    return agentRepository.findAll(org.Organization_Id, query);
};

const getAgentById = (agentId) => {
    const agent = agentRepository.findById(agentId);
    if (!agent) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.AGENT_NOT_FOUND, "Agent not found");
    }
    return agent;
};

module.exports = { listAgents, getAgentById };
