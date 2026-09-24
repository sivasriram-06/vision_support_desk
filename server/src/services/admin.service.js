const agentRepository = require("../repositories/agent.repository");
const loginEventRepository = require("../repositories/auth-login-event.repository");
const organizationService = require("./organization.service");
const agentService = require("./agent.service");
const authService = require("./auth.service");
const env = require("../config/env");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const { ROLE_KEYS } = require("../constants/permissions");

// Only a real Admin may touch another Admin's sign-in, so a Manager with
// admin access can't reset the Admin's password and take the account over.
const assertCanManageLogin = (targetAgentId, actor) => {
    const target = agentService.getAgentById(targetAgentId);
    const targetDirectory = agentRepository.findDirectoryById(targetAgentId);
    if (targetDirectory.Role_Key === ROLE_KEYS.ADMIN && actor.roleKey !== ROLE_KEYS.ADMIN) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, "Only an Admin can change another Admin's sign-in");
    }
    return target;
};

const listUsers = () => {
    const org = organizationService.getDefaultOrganization();
    return agentRepository.findAll(org.Organization_Id)
        .filter((agent) => agent.Email !== organizationService.SYSTEM_AGENT_EMAIL);
};

const setTemporaryPassword = (agentId, password, actor) => {
    assertCanManageLogin(agentId, actor);
    authService.setPassword(agentId, password, { mustChange: true, actorAgentId: actor.agentId });
    return agentRepository.findDirectoryById(agentId);
};

const revokeLogin = (agentId, actor) => {
    if (agentId === actor.agentId) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.FORBIDDEN, "You can't revoke your own sign-in");
    }
    assertCanManageLogin(agentId, actor);
    authService.revokeLogin(agentId, actor.agentId);
    return agentRepository.findDirectoryById(agentId);
};

const listLoginEvents = () => {
    const org = organizationService.getDefaultOrganization();
    return loginEventRepository.findRecent(org.Organization_Id, 100);
};

/** Read-only view of the Gmail integration config. Secrets are never returned. */
const getMailIntegration = () => ({
    mailbox: env.google.mailbox,
    connected: !!env.google.refreshToken,
    syncEnabled: env.google.syncEnabled,
    syncIntervalSeconds: Math.round(env.google.syncIntervalMs / 1000)
});

module.exports = { listUsers, setTemporaryPassword, revokeLogin, listLoginEvents, getMailIntegration };
