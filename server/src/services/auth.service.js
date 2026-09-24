const jwt = require("jsonwebtoken");
const authConfig = require("../config/auth");
const agentRepository = require("../repositories/agent.repository");
const roleRepository = require("../repositories/role.repository");
const credentialRepository = require("../repositories/agent-credential.repository");
const loginEventRepository = require("../repositories/auth-login-event.repository");
const organizationService = require("./organization.service");
const permissionService = require("./permission.service");
const generateId = require("../utils/generate-id");
const { hashPassword, verifyPassword, getPasswordPolicyError } = require("../utils/password");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// Same message for unknown email, wrong password and no credential, so the
// login form can't be used to discover which emails have accounts.
const invalidCredentials = () =>
    new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.INVALID_CREDENTIALS, "Invalid email or password");

const sqliteNow = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/**
 * Loads everything a request needs to authorize the acting agent. Read
 * fresh from the database on every request (not from the JWT) so a role
 * change, permission edit or deactivation takes effect immediately.
 */
const buildPrincipal = (agentId) => {
    const agent = agentRepository.findDirectoryById(agentId);
    if (!agent) return null;
    const role = agent.Role_Id ? roleRepository.findById(agent.Role_Id) : null;
    const credential = credentialRepository.findByAgentId(agentId);
    return {
        agentId: agent.Agent_Id,
        firstName: agent.First_Name,
        lastName: agent.Last_Name,
        email: agent.Email,
        status: agent.Status,
        teamId: agent.Primary_Department_Id || null,
        teamName: agent.Team_Name || null,
        roleId: role && role.Role_Key ? role.Role_Id : null,
        roleKey: role ? role.Role_Key || null : null,
        roleName: role && role.Role_Key ? role.Role_Name : null,
        permissions: permissionService.getRolePermissions(role),
        mustChangePassword: credential ? credential.Must_Change_Password === "Y" : false,
        hasCredential: !!credential
    };
};

const toMeDto = (principal) => {
    const { hasCredential, ...rest } = principal; // eslint-disable-line no-unused-vars
    return rest;
};

const issueToken = (agentId) =>
    jwt.sign({ sub: agentId }, authConfig.jwtSecret, { expiresIn: authConfig.jwtExpiresIn });

const login = ({ email, password }, { ipAddress, userAgent }) => {
    const org = organizationService.getDefaultOrganization();
    const normalizedEmail = email.trim().toLowerCase();
    const logFailure = (agentId, failureCode) =>
        loginEventRepository.record({ agentId, eventType: "LOGIN_FAILURE", loginEmail: normalizedEmail, failureCode, ipAddress, userAgent, orgId: org.Organization_Id });

    const agent = agentRepository.findByEmail(org.Organization_Id, normalizedEmail);
    const credential = agent ? credentialRepository.findByAgentId(agent.Agent_Id) : null;
    if (!agent || !credential) {
        logFailure(agent ? agent.Agent_Id : null, agent ? "NO_CREDENTIAL" : "UNKNOWN_EMAIL");
        throw invalidCredentials();
    }

    if (credential.Locked_Until && credential.Locked_Until > sqliteNow()) {
        logFailure(agent.Agent_Id, "LOCKED");
        throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.ACCOUNT_LOCKED, `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes or ask an admin to reset your password.`);
    }

    if (!verifyPassword(password, credential.Password_Hash)) {
        const failed = (credential.Failed_Login_Count || 0) + 1;
        const changes = { Failed_Login_Count: failed };
        if (failed >= MAX_FAILED_ATTEMPTS) {
            changes.Locked_Until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString().replace("T", " ").slice(0, 19);
            changes.Failed_Login_Count = 0;
        }
        credentialRepository.updateById(credential.Agent_Credential_Id, changes);
        logFailure(agent.Agent_Id, "BAD_PASSWORD");
        throw invalidCredentials();
    }

    if (agent.Status !== "Active") {
        logFailure(agent.Agent_Id, "INACTIVE");
        throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.ACCOUNT_INACTIVE, "This account is inactive. Contact your administrator.");
    }

    credentialRepository.updateById(credential.Agent_Credential_Id, {
        Failed_Login_Count: 0,
        Locked_Until: null,
        Last_Login_Time: sqliteNow()
    });
    loginEventRepository.record({ agentId: agent.Agent_Id, eventType: "LOGIN_SUCCESS", loginEmail: normalizedEmail, ipAddress, userAgent, orgId: org.Organization_Id });

    return { token: issueToken(agent.Agent_Id), agent: toMeDto(buildPrincipal(agent.Agent_Id)) };
};

const logout = (principal, { ipAddress, userAgent }) => {
    const org = organizationService.getDefaultOrganization();
    loginEventRepository.record({ agentId: principal.agentId, eventType: "LOGOUT", loginEmail: principal.email, ipAddress, userAgent, orgId: org.Organization_Id });
};

/**
 * Creates or replaces an agent's password. Used by seeding, the admin
 * "set temporary password" action (mustChange = true) and self-service
 * change-password (mustChange = false).
 *
 * The strength policy applies only to passwords a user chooses for
 * themselves. Temporary passwords (the shared seed default, admin resets)
 * are exempt - they can't be used for anything but choosing a real one,
 * because mustChange blocks every other route until then.
 */
const setPassword = (agentId, password, { mustChange, actorAgentId }) => {
    const policyError = mustChange ? (password ? null : "Password is required") : getPasswordPolicyError(password);
    if (policyError) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.WEAK_PASSWORD, policyError);
    }
    const org = organizationService.getDefaultOrganization();
    const fields = {
        Password_Hash: hashPassword(password),
        Must_Change_Password: mustChange ? "Y" : "N",
        Password_Changed_Time: sqliteNow(),
        Failed_Login_Count: 0,
        Locked_Until: null,
        Modified_By: actorAgentId
    };
    const existing = credentialRepository.findByAgentId(agentId);
    if (existing) {
        credentialRepository.updateById(existing.Agent_Credential_Id, fields);
    } else {
        credentialRepository.insert({
            Agent_Credential_Id: generateId(),
            Agent_Id: agentId,
            ...fields,
            Created_By: actorAgentId,
            Org_Id: org.Organization_Id
        });
    }
};

const changePassword = (principal, { currentPassword, newPassword }) => {
    const credential = credentialRepository.findByAgentId(principal.agentId);
    if (!credential || !verifyPassword(currentPassword, credential.Password_Hash)) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.INVALID_CREDENTIALS, "Current password is incorrect");
    }
    if (currentPassword === newPassword) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.WEAK_PASSWORD, "New password must be different from the current one");
    }
    setPassword(principal.agentId, newPassword, { mustChange: false, actorAgentId: principal.agentId });
    return toMeDto(buildPrincipal(principal.agentId));
};

const revokeLogin = (agentId, actorAgentId) => {
    const credential = credentialRepository.findByAgentId(agentId);
    if (credential) {
        credentialRepository.softDeleteById(credential.Agent_Credential_Id, actorAgentId);
    }
};

module.exports = { buildPrincipal, toMeDto, login, logout, setPassword, changePassword, revokeLogin };
