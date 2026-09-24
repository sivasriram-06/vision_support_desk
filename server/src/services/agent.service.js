const agentRepository = require("../repositories/agent.repository");
const organizationService = require("./organization.service");
const departmentService = require("./department.service");
const permissionService = require("./permission.service");
const authService = require("./auth.service");
const { PERMISSIONS, ROLE_KEYS } = require("../constants/permissions");
const generateId = require("../utils/generate-id");
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

const directoryOrThrow = (agentId) => {
    getAgentById(agentId);
    return agentRepository.findDirectoryById(agentId);
};

const getAgentDirectoryById = (agentId) => directoryOrThrow(agentId);

/**
 * Role changes are permission-sensitive: they need the Admin-page
 * permission (not just agents.manage), only an Admin can grant or remove
 * the Admin role, and nobody can change their own role (no self-promotion,
 * no accidental self-lockout).
 */
const assertCanSetRole = (targetAgentId, currentRoleKey, newRoleId, actor) => {
    if (!actor.permissions.includes(PERMISSIONS.ADMIN_ACCESS)) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, "Changing roles requires Admin controller access");
    }
    if (targetAgentId && targetAgentId === actor.agentId) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, "You can't change your own role");
    }
    const newRole = newRoleId ? permissionService.getKeyedRoleById(newRoleId) : null;
    const touchesAdmin = currentRoleKey === ROLE_KEYS.ADMIN || (newRole && newRole.Role_Key === ROLE_KEYS.ADMIN);
    if (touchesAdmin && actor.roleKey !== ROLE_KEYS.ADMIN) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, "Only an Admin can grant or remove the Admin role");
    }
    return newRole;
};

const assertTeam = (departmentId) => {
    if (departmentId) departmentService.getDepartmentById(departmentId);
};

/**
 * Creates an agent (Resource) with team + role. No sign-in credential is
 * provisioned here - an admin issues a temporary password from the Admin
 * page when the person should be able to log in.
 */
const createAgent = (payload, actor) => {
    const org = organizationService.getDefaultOrganization();
    const email = payload.email.trim().toLowerCase();

    const existing = agentRepository.findByEmail(org.Organization_Id, email);
    if (existing) {
        throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_CODES.AGENT_DUPLICATE, "An agent with this email already exists");
    }
    assertTeam(payload.departmentId);
    const role = payload.roleId ? assertCanSetRole(null, null, payload.roleId, actor) : null;

    const agentId = generateId();
    agentRepository.insert({
        Agent_Id: agentId,
        Zuid: agentId,
        First_Name: payload.firstName.trim(),
        Last_Name: (payload.lastName || "").trim(),
        Email: email,
        Status: "Active",
        Role_Id: role ? role.Role_Id : null,
        Primary_Department_Id: payload.departmentId || null,
        Is_Confirmed: "N",
        Created_By: actor.agentId,
        Org_Id: org.Organization_Id
    });
    return agentRepository.findDirectoryById(agentId);
};

const updateAgent = (agentId, payload, actor) => {
    const org = organizationService.getDefaultOrganization();
    const current = directoryOrThrow(agentId);

    const changes = { Modified_By: actor.agentId };
    if (payload.firstName !== undefined) changes.First_Name = payload.firstName.trim();
    if (payload.lastName !== undefined) changes.Last_Name = (payload.lastName || "").trim();
    if (payload.departmentId !== undefined && payload.departmentId !== current.Primary_Department_Id) {
        assertTeam(payload.departmentId);
        changes.Primary_Department_Id = payload.departmentId;
    }
    if (payload.email !== undefined) {
        const email = payload.email.trim().toLowerCase();
        if (email !== current.Email) {
            const duplicate = agentRepository.findByEmail(org.Organization_Id, email);
            if (duplicate && duplicate.Agent_Id !== agentId) {
                throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_CODES.AGENT_DUPLICATE, "An agent with this email already exists");
            }
            changes.Email = email;
        }
    }
    if (payload.status !== undefined && payload.status !== current.Status) {
        if (agentId === actor.agentId) {
            throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, "You can't deactivate your own account");
        }
        if (current.Role_Key === ROLE_KEYS.ADMIN && actor.roleKey !== ROLE_KEYS.ADMIN) {
            throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, "Only an Admin can deactivate an Admin");
        }
        changes.Status = payload.status;
    }
    const currentRoleId = current.Role_Key ? current.Role_Id : null;
    if (payload.roleId !== undefined && (payload.roleId || null) !== currentRoleId) {
        const role = assertCanSetRole(agentId, current.Role_Key, payload.roleId, actor);
        changes.Role_Id = role ? role.Role_Id : null;
    }

    agentRepository.updateById(agentId, changes);
    return agentRepository.findDirectoryById(agentId);
};

const deleteAgent = (agentId, actor) => {
    const current = directoryOrThrow(agentId);
    if (agentId === actor.agentId) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, "You can't delete your own account");
    }
    if (current.Role_Key === ROLE_KEYS.ADMIN && actor.roleKey !== ROLE_KEYS.ADMIN) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, "Only an Admin can delete an Admin");
    }
    agentRepository.softDeleteById(agentId, actor.agentId);
    authService.revokeLogin(agentId, actor.agentId);
};

/**
 * Used by the Gmail ingestion engine to attribute an outbound (agent-sent)
 * message: reuses the existing agent for that From address when one
 * exists, otherwise creates one from the real name/email Gmail itself
 * reports on the message - never a hardcoded placeholder. Whatever mailbox
 * the .env credentials point to (test today, production later), whoever's
 * name appears in that mailbox's own "From" header is who shows up here,
 * with no code change needed when the credentials change.
 */
const findOrCreateBySender = ({ email, name }, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const normalizedEmail = email.trim().toLowerCase();

    const existing = agentRepository.findByEmail(org.Organization_Id, normalizedEmail);
    if (existing) {
        return existing;
    }

    const [firstName, ...rest] = (name || normalizedEmail).trim().split(" ");
    const lastName = rest.join(" ") || firstName;

    const agentId = generateId();
    agentRepository.insert({
        Agent_Id: agentId,
        Zuid: agentId,
        First_Name: firstName,
        Last_Name: lastName,
        Email: normalizedEmail,
        Status: "Active",
        Is_Confirmed: "N",
        Created_By: actorAgentId,
        Org_Id: org.Organization_Id
    });
    return agentRepository.findById(agentId);
};

module.exports = { listAgents, getAgentById, getAgentDirectoryById, createAgent, updateAgent, deleteAgent, findOrCreateBySender };
