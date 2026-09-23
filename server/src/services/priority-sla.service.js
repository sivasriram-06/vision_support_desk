const prioritySlaRepository = require("../repositories/priority-sla.repository");
const organizationService = require("./organization.service");
const generateId = require("../utils/generate-id");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");

const listConfig = () => {
    const org = organizationService.getDefaultOrganization();
    return prioritySlaRepository.findAll(org.Organization_Id);
};

const createConfig = (priority, slaHours, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const priorityKey = priority.trim();

    const existing = prioritySlaRepository.findByPriority(org.Organization_Id, priorityKey);
    if (existing) {
        throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_CODES.PRIORITY_DUPLICATE, "This priority already exists");
    }

    const id = generateId();
    prioritySlaRepository.insert({
        Priority_Sla_Config_Id: id,
        Priority: priorityKey,
        Sla_Hours: slaHours,
        Created_By: actorAgentId,
        Org_Id: org.Organization_Id
    });
    return prioritySlaRepository.findById(id);
};

const upsertConfig = (priority, slaHours, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const existing = prioritySlaRepository.findByPriority(org.Organization_Id, priority);
    if (!existing) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.PRIORITY_NOT_FOUND, "Priority not found");
    }

    prioritySlaRepository.updateById(existing.Priority_Sla_Config_Id, {
        Sla_Hours: slaHours,
        Modified_By: actorAgentId
    });
    return prioritySlaRepository.findByPriority(org.Organization_Id, priority);
};

/**
 * Soft-deletes the priority from the config list. Tickets already carrying
 * this priority keep the raw text value (Priority isn't FK-constrained on
 * HD_TICKET_MASTER, same as Product_Id) - deleting it here only stops it
 * from being offered/SLA-calculated going forward.
 */
const deleteConfig = (priority, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const existing = prioritySlaRepository.findByPriority(org.Organization_Id, priority);
    if (!existing) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.PRIORITY_NOT_FOUND, "Priority not found");
    }
    prioritySlaRepository.softDeleteById(existing.Priority_Sla_Config_Id, actorAgentId);
};

/**
 * Used by ticket.service.js: null if no admin config exists for that
 * priority (leaves Response_Due_Date untouched rather than guessing).
 */
const getSlaHoursForPriority = (orgId, priority) => {
    if (!priority) return null;
    const config = prioritySlaRepository.findByPriority(orgId, priority);
    return config ? config.Sla_Hours : null;
};

module.exports = { listConfig, createConfig, upsertConfig, deleteConfig, getSlaHoursForPriority };
