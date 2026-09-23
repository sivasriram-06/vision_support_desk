const agentRepository = require("../repositories/agent.repository");
const organizationService = require("./organization.service");
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

/**
 * Minimal agent creation - name, email, department. No auth identity is
 * provisioned here (HD_AGENT_AUTH), so a created agent can be assigned
 * tickets but can't sign in yet; that's a future enhancement once agent
 * login is built.
 */
const createAgent = (payload, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const email = payload.email.trim().toLowerCase();

    const existing = agentRepository.findByEmail(org.Organization_Id, email);
    if (existing) {
        throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_CODES.AGENT_DUPLICATE, "An agent with this email already exists");
    }

    const agentId = generateId();
    agentRepository.insert({
        Agent_Id: agentId,
        Zuid: agentId,
        First_Name: payload.firstName.trim(),
        Last_Name: payload.lastName.trim(),
        Email: email,
        Status: "Active",
        Primary_Department_Id: payload.departmentId || null,
        Is_Confirmed: "N",
        Created_By: actorAgentId,
        Org_Id: org.Organization_Id
    });
    return agentRepository.findById(agentId);
};

const updateAgent = (agentId, payload, actorAgentId) => {
    getAgentById(agentId);

    const changes = { Modified_By: actorAgentId };
    if (payload.firstName !== undefined) changes.First_Name = payload.firstName.trim();
    if (payload.lastName !== undefined) changes.Last_Name = payload.lastName.trim();
    if (payload.departmentId !== undefined) changes.Primary_Department_Id = payload.departmentId;
    if (payload.status !== undefined) changes.Status = payload.status;

    agentRepository.updateById(agentId, changes);
    return agentRepository.findById(agentId);
};

const deleteAgent = (agentId, actorAgentId) => {
    getAgentById(agentId);
    agentRepository.softDeleteById(agentId, actorAgentId);
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

module.exports = { listAgents, getAgentById, createAgent, updateAgent, deleteAgent, findOrCreateBySender };
