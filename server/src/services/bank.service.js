const bankRepository = require("../repositories/bank.repository");
const agentRepository = require("../repositories/agent.repository");
const departmentService = require("./department.service");
const organizationService = require("./organization.service");
const { getDB } = require("../config/db");
const generateId = require("../utils/generate-id");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const { DateTime } = require("luxon");
const ticketRepository = require("../repositories/ticket.repository");
const { computeSlaDueDate } = require("./sla/sla.service");
const { WEEKDAYS } = require("./sla/business-calendar");
const { recomputeStoppedResolutionForBank } = require("./sla/resolution-clock.service");
const escalationService = require("./sla/escalation.service");

// payload key -> HD_BANK_MASTER column, for the plain text/flag fields.
const DETAIL_FIELDS = {
    country: "Country",
    module: "Module",
    supportLevel: "Support_Level",
    supportStartIst: "Support_Start_Ist",
    supportEndIst: "Support_End_Ist",
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
    // 24x7 cover means every day counts for SLA; otherwise store the picked
    // days in week order.
    if (payload.is24x7 === true) {
        changes.Working_Days = WEEKDAYS.join(",");
    } else if (payload.workingDays !== undefined) {
        changes.Working_Days = WEEKDAYS.filter((day) => payload.workingDays.includes(day)).join(",");
    }
    if (payload.timeZone !== undefined) {
        if (!DateTime.local().setZone(payload.timeZone).isValid) {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, `Unknown time zone "${payload.timeZone}"`);
        }
        changes.Time_Zone = payload.timeZone;
    }
    return changes;
};

/** The support window must close after it opens (same IST day). */
const assertSupportWindow = (start, end) => {
    if (start && end && end <= start) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, "Support hours must end after they start");
    }
};

/**
 * A bank's calendar feeds every SLA due date on its tickets, so when it
 * changes, open tickets (not resolved/closed) are re-dated on the new
 * calendar, along with their escalation triggers. Resolved tickets keep
 * the SLA they were measured against.
 */
const recomputeOpenTicketSlas = (bankId, orgId, actorAgentId) => {
    for (const ticket of ticketRepository.findOpenWithPriorityByBankId(bankId)) {
        const dueDate = computeSlaDueDate({ createdTime: ticket.Created_Time, priority: ticket.Priority, bankId, orgId });
        ticketRepository.updateById(ticket.Ticket_Id, { Response_Due_Date: dueDate, Modified_By: actorAgentId });
        escalationService.rebuildTriggers({ ...ticket, Bank_Id: bankId, Response_Due_Date: dueDate }, orgId);
    }
};

const createBank = (payload, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const department = departmentService.getDepartmentById(payload.departmentId);
    const bankName = payload.bankName.trim();
    assertUniqueName(org.Organization_Id, bankName, null);
    assertSupportWindow(payload.supportStartIst, payload.supportEndIst);

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
    const existing = getBankById(bankId);
    const org = organizationService.getDefaultOrganization();

    const changes = { ...detailChanges(payload), Modified_By: actorAgentId };
    assertSupportWindow(changes.Support_Start_Ist || existing.Support_Start_Ist, changes.Support_End_Ist || existing.Support_End_Ist);
    if (payload.departmentId !== undefined) {
        departmentService.getDepartmentById(payload.departmentId);
        changes.Department_Id = payload.departmentId;
    }
    if (payload.bankName !== undefined) {
        const bankName = payload.bankName.trim();
        assertUniqueName(org.Organization_Id, bankName, bankId);
        changes.Bank_Name = bankName;
    }

    const calendarChanged = ["Working_Days", "Time_Zone", "Is_24x7"].some((column) => changes[column] !== undefined);
    const hoursChanged = ["Support_Start_Ist", "Support_End_Ist"].some((column) => changes[column] !== undefined);
    getDB().transaction(() => {
        bankRepository.updateById(bankId, changes);
        applyResources(bankId, payload, actorAgentId, org.Organization_Id);
        if (calendarChanged) recomputeOpenTicketSlas(bankId, org.Organization_Id, actorAgentId);
        // Support hours only bound resolution time, not the SLA.
        if (calendarChanged || hoursChanged) recomputeStoppedResolutionForBank(bankId, actorAgentId);
    })();
    return getBankById(bankId);
};

const deleteBank = (bankId, actorAgentId) => {
    getBankById(bankId);
    bankRepository.softDeleteById(bankId, actorAgentId);
};

module.exports = { listBanks, getBankById, createBank, updateBank, deleteBank };
