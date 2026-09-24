const bankRepository = require("../repositories/bank.repository");
const agentRepository = require("../repositories/agent.repository");
const departmentService = require("./department.service");
const organizationService = require("./organization.service");
const { getDB } = require("../config/db");
const generateId = require("../utils/generate-id");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");

// payload key -> HD_BANK_MASTER column, for the plain text/flag fields.
const DETAIL_FIELDS = {
    country: "Country",
    module: "Module",
    supportLevel: "Support_Level",
    supportDays: "Support_Days",
    supportHoursLocal: "Support_Hours_Local",
    supportHoursIst: "Support_Hours_Ist",
    remarks: "Remarks"
};

const blankToNull = (value) => {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed === "" ? null : trimmed;
};

const listBanks = (query) => {
    const org = organizationService.getDefaultOrganization();
    return bankRepository.findAll(org.Organization_Id, query);
};

const getBankById = (bankId) => {
    const bank = bankRepository.findDetailById(bankId);
    if (!bank) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.BANK_NOT_FOUND, "Bank not found");
    }
    return bank;
};

const assertUniqueName = (orgId, bankName, bankId) => {
    const duplicate = bankRepository.findByName(orgId, bankName);
    if (duplicate && duplicate.Bank_Id !== bankId) {
        throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_CODES.BANK_DUPLICATE, "A bank with this name already exists");
    }
};

const assertAgents = (agentIds) => {
    for (const agentId of agentIds) {
        if (!agentRepository.findById(agentId)) {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.AGENT_NOT_FOUND, "One of the selected resources no longer exists");
        }
    }
};

const applyResources = (bankId, payload, actorAgentId, orgId) => {
    if (payload.primaryResourceIds !== undefined) {
        assertAgents(payload.primaryResourceIds);
        bankRepository.replaceResources(bankId, "PRIMARY", payload.primaryResourceIds, { actorAgentId, orgId });
    }
    if (payload.secondaryResourceIds !== undefined) {
        assertAgents(payload.secondaryResourceIds);
        bankRepository.replaceResources(bankId, "SECONDARY", payload.secondaryResourceIds, { actorAgentId, orgId });
    }
};

const detailChanges = (payload) => {
    const changes = {};
    for (const [key, column] of Object.entries(DETAIL_FIELDS)) {
        if (payload[key] !== undefined) changes[column] = blankToNull(payload[key]);
    }
    if (payload.is24x7 !== undefined) changes.Is_24x7 = payload.is24x7 ? "Y" : "N";
    return changes;
};

const createBank = (payload, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const department = departmentService.getDepartmentById(payload.departmentId);
    const bankName = payload.bankName.trim();
    assertUniqueName(org.Organization_Id, bankName, null);

    const bankId = generateId();
    getDB().transaction(() => {
        bankRepository.insert({
            Bank_Id: bankId,
            Bank_Name: bankName,
            Department_Id: department.Department_Id,
            Is_24x7: "N",
            ...detailChanges(payload),
            Created_By: actorAgentId,
            Org_Id: org.Organization_Id
        });
        applyResources(bankId, payload, actorAgentId, org.Organization_Id);
    })();
    return getBankById(bankId);
};

const updateBank = (bankId, payload, actorAgentId) => {
    getBankById(bankId);
    const org = organizationService.getDefaultOrganization();

    const changes = { ...detailChanges(payload), Modified_By: actorAgentId };
    if (payload.departmentId !== undefined) {
        departmentService.getDepartmentById(payload.departmentId);
        changes.Department_Id = payload.departmentId;
    }
    if (payload.bankName !== undefined) {
        const bankName = payload.bankName.trim();
        assertUniqueName(org.Organization_Id, bankName, bankId);
        changes.Bank_Name = bankName;
    }

    getDB().transaction(() => {
        bankRepository.updateById(bankId, changes);
        applyResources(bankId, payload, actorAgentId, org.Organization_Id);
    })();
    return getBankById(bankId);
};

const deleteBank = (bankId, actorAgentId) => {
    getBankById(bankId);
    bankRepository.softDeleteById(bankId, actorAgentId);
};

module.exports = { listBanks, getBankById, createBank, updateBank, deleteBank };
