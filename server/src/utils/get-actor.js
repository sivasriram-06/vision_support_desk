const organizationService = require("../services/organization.service");

/**
 * Resolves the acting agent for a write. Falls back to the system actor
 * while the Login & Security module (/api/v1/auth/*) is not implemented yet
 * and no route uses auth.middleware.js.
 */
const getActorAgentId = (req) => {
    if (req.agent?.agentId) {
        return req.agent.agentId;
    }
    return organizationService.getSystemAgent().Agent_Id;
};

module.exports = getActorAgentId;
