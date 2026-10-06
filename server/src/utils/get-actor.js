const organizationService = require("../services/organization.service");

// Acting agent for a write; falls back to the system actor when the request has no signed-in agent.
const getActorAgentId = (req) => {
    if (req.agent?.agentId) {
        return req.agent.agentId;
    }
    return organizationService.getSystemAgent().Agent_Id;
};

module.exports = getActorAgentId;
