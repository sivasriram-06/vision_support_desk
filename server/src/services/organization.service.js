const organizationRepository = require("../repositories/organization.repository");
const agentRepository = require("../repositories/agent.repository");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");

const SYSTEM_AGENT_EMAIL = "system@sunoida.com";

let cachedOrg = null;
let cachedSystemAgent = null;

/**
 * Every request is scoped to this single tenant's Org_Id, resolved from the
 * database rather than trusted from the client (Clone_API_Standards:
 * "Tenant isolation"). Cached after first lookup since this deployment is
 * single-tenant.
 */
const getDefaultOrganization = () => {
    if (cachedOrg) {
        return cachedOrg;
    }
    const org = organizationRepository.findFirst();
    if (!org) {
        throw new ApiError(
            HTTP_STATUS.INTERNAL_SERVER_ERROR,
            ERROR_CODES.INTERNAL_ERROR,
            "No organization found. Run `npm run seed` before starting the server."
        );
    }
    cachedOrg = org;
    return org;
};

/**
 * System actor used as Created_By/Author for records the Gmail ingestion
 * engine creates without a human agent in the loop.
 */
const getSystemAgent = () => {
    if (cachedSystemAgent) {
        return cachedSystemAgent;
    }
    const org = getDefaultOrganization();
    const agent = agentRepository.findByEmail(org.Organization_Id, SYSTEM_AGENT_EMAIL);
    if (!agent) {
        throw new ApiError(
            HTTP_STATUS.INTERNAL_SERVER_ERROR,
            ERROR_CODES.INTERNAL_ERROR,
            "System agent not found. Run `npm run seed` before starting the server."
        );
    }
    cachedSystemAgent = agent;
    return agent;
};

const resetCache = () => {
    cachedOrg = null;
    cachedSystemAgent = null;
};

module.exports = { getDefaultOrganization, getSystemAgent, resetCache, SYSTEM_AGENT_EMAIL };
