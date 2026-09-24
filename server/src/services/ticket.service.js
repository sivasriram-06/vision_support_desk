const { getDB } = require("../config/db");
const ticketRepository = require("../repositories/ticket.repository");
const { history: historyRepository, resolution: resolutionRepository, metrics: metricsRepository } = require("../repositories/history.repository");
const departmentRepository = require("../repositories/department.repository");
const bankRepository = require("../repositories/bank.repository");
const contactRepository = require("../repositories/contact.repository");
const organizationService = require("./organization.service");
const { computeSlaDueDate } = require("./sla/sla.service");
const resolutionClock = require("./sla/resolution-clock.service");
const generateId = require("../utils/generate-id");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const { STATUS_TYPE, DEFAULT_STATUS_BY_TYPE, TICKET_HISTORY_EVENT } = require("../constants/ticket.constants");
const { buildPaging } = require("../utils/pagination");

const nowIso = () => new Date().toISOString();

const recordHistory = ({ ticketId, eventName, fieldName = null, oldValue = null, newValue = null, actorAgentId, orgId }) => {
    historyRepository.insert({
        History_Id: generateId(),
        Ticket_Id: ticketId,
        Event_Name: eventName,
        Field_Name: fieldName,
        Old_Value: oldValue !== null ? String(oldValue) : null,
        New_Value: newValue !== null ? String(newValue) : null,
        Actor_Agent_Id: actorAgentId,
        Event_Time: nowIso(),
        Created_By: actorAgentId,
        Org_Id: orgId
    });
};

const listTickets = (query) => {
    const org = organizationService.getDefaultOrganization();
    const { rows, total, page, limit } = ticketRepository.findAll(org.Organization_Id, query);
    return { data: rows, paging: buildPaging({ page, limit }, total) };
};

const getAgentQueue = (agentId, query) => {
    const org = organizationService.getDefaultOrganization();
    const { rows, total, page, limit } = ticketRepository.findAgentQueue(org.Organization_Id, agentId, query);
    return { data: rows, paging: buildPaging({ page, limit }, total) };
};

const getBankQueue = (bankId, query) => {
    const org = organizationService.getDefaultOrganization();
    const { rows, total, page, limit } = ticketRepository.findBankQueue(org.Organization_Id, bankId, query);
    return { data: rows, paging: buildPaging({ page, limit }, total) };
};

/** The support team (department) that works a bank, or null. */
const departmentForBank = (bankId) => {
    if (!bankId) return null;
    const bank = bankRepository.findById(bankId);
    if (!bank) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.BANK_NOT_FOUND, "Bank not found");
    }
    return bank.Department_Id;
};

const getTicketById = (ticketId) => {
    const ticket = ticketRepository.findById(ticketId);
    if (!ticket) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.TICKET_NOT_FOUND, "Ticket not found");
    }
    return ticket;
};

/**
 * Creates a ticket + its initial history row + an empty metrics row in one
 * transaction, per "use transactions for multi-table business operations".
 */
const createTicket = (payload, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();

    const department = departmentRepository.findById(payload.departmentId);
    if (!department) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.DEPARTMENT_NOT_FOUND, "Department not found");
    }

    const contact = contactRepository.findById(payload.contactId);
    if (!contact) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.CONTACT_NOT_FOUND, "Contact not found");
    }

    const db = getDB();
    const createTxn = db.transaction(() => {
        const ticketId = generateId();
        const ticketNumber = ticketRepository.findNextTicketNumber(org.Organization_Id);
        const createdTime = nowIso();
        const statusType = payload.statusType || STATUS_TYPE.OPEN;
        const status = payload.status || DEFAULT_STATUS_BY_TYPE[statusType];

        ticketRepository.insert({
            Ticket_Id: ticketId,
            Ticket_Number: ticketNumber,
            Subject: payload.subject,
            Description: payload.description || null,
            Status: status,
            Status_Type: statusType,
            Priority: payload.priority || null,
            Channel: payload.channel,
            Department_Id: departmentForBank(payload.bankId) || payload.departmentId,
            Bank_Id: payload.bankId || null,
            Contact_Id: payload.contactId,
            Account_Id: payload.accountId || null,
            Assignee_Id: payload.assigneeId || null,
            Response_Due_Date: computeSlaDueDate({ createdTime, priority: payload.priority, bankId: payload.bankId, orgId: org.Organization_Id }),
            // Stored explicitly as ISO-8601 UTC (same instant the SLA was
            // computed from). The column default, datetime('now'), writes
            // "YYYY-MM-DD HH:MM:SS" - mixing the two formats breaks text
            // sorting ("T" > " "), so "Newest first" put new tickets low.
            Created_Time: createdTime,
            Created_By: actorAgentId,
            Org_Id: org.Organization_Id
        });

        recordHistory({
            ticketId,
            eventName: TICKET_HISTORY_EVENT.CREATED,
            actorAgentId,
            orgId: org.Organization_Id
        });

        metricsRepository.insert({
            Metric_Id: generateId(),
            Ticket_Id: ticketId,
            Reopen_Count: 0,
            Reassign_Count: 0,
            Response_Count: 0,
            Created_By: actorAgentId,
            Org_Id: org.Organization_Id
        });

        // Start the resolution clock if the ticket is created straight into
        // a running status (email tickets start "Unassigned" = not started).
        const clockChanges = resolutionClock.applyStatusChange({
            ticket: { Ticket_Id: ticketId, Clock_State: "NOT_STARTED" },
            newStatus: status,
            bankId: payload.bankId,
            actorAgentId,
            orgId: org.Organization_Id
        });
        ticketRepository.updateById(ticketId, clockChanges);

        return ticketId;
    });

    const ticketId = createTxn();
    return getTicketById(ticketId);
};

/**
 * Updates a ticket and writes one HD_TICKET_HISTORY row per changed field,
 * per "all ticket mutations create history records".
 */
const updateTicket = (ticketId, payload, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const existing = getTicketById(ticketId);

    const FIELD_MAP = {
        subject: "Subject",
        description: "Description",
        status: "Status",
        priority: "Priority",
        departmentId: "Department_Id",
        bankId: "Bank_Id",
        assigneeId: "Assignee_Id",
        productId: "Product_Id",
        category: "Category",
        subCategory: "Sub_Category",
        classification: "Classification",
        dueDate: "Due_Date"
    };

    // A bank is worked by exactly one support team, so picking the bank
    // routes the ticket to that team's department unless the caller set a
    // department explicitly in the same request.
    if (payload.bankId && payload.bankId !== existing.Bank_Id && payload.departmentId === undefined) {
        const bankDepartmentId = departmentForBank(payload.bankId);
        if (bankDepartmentId) payload = { ...payload, departmentId: bankDepartmentId };
    }

    const changes = {};
    const historyEntries = [];

    for (const [key, column] of Object.entries(FIELD_MAP)) {
        if (payload[key] === undefined) {
            continue;
        }
        const oldValue = existing[column];
        const newValue = payload[key];
        if (oldValue === newValue) {
            continue;
        }
        changes[column] = newValue;

        let eventName = "FIELD_CHANGE";
        if (column === "Status") eventName = TICKET_HISTORY_EVENT.STATUS_CHANGE;
        else if (column === "Priority") eventName = TICKET_HISTORY_EVENT.PRIORITY_CHANGE;
        else if (column === "Assignee_Id") eventName = TICKET_HISTORY_EVENT.REASSIGNED;

        historyEntries.push({ eventName, fieldName: column, oldValue, newValue });
    }

    // SLA due date (Response_Due_Date) is derived, never sent: priority SLA
    // hours from Created_Time on the bank's working-day calendar. Recomputed
    // when priority or bank changes (clearing priority clears the SLA);
    // status changes never move it - the SLA does not pause.
    const effectiveBankId = changes.Bank_Id !== undefined ? changes.Bank_Id : existing.Bank_Id;
    if (changes.Priority !== undefined || changes.Bank_Id !== undefined) {
        changes.Response_Due_Date = computeSlaDueDate({
            createdTime: existing.Created_Time,
            priority: changes.Priority !== undefined ? changes.Priority : existing.Priority,
            bankId: effectiveBankId,
            orgId: org.Organization_Id
        });
    }

    if (Object.keys(changes).length === 0) {
        return existing;
    }

    const db = getDB();
    const updateTxn = db.transaction(() => {
        // Status drives the resolution clock (Clock_State, segments,
        // Resolved_Time) - see services/sla/resolution-clock.service.js.
        if (changes.Status !== undefined) {
            Object.assign(changes, resolutionClock.applyStatusChange({
                ticket: existing,
                newStatus: changes.Status,
                bankId: effectiveBankId,
                actorAgentId,
                orgId: org.Organization_Id
            }));
        }
        changes.Modified_By = actorAgentId;
        ticketRepository.updateById(ticketId, changes);
        for (const entry of historyEntries) {
            recordHistory({
                ticketId,
                eventName: entry.eventName,
                fieldName: entry.fieldName,
                oldValue: entry.oldValue,
                newValue: entry.newValue,
                actorAgentId,
                orgId: org.Organization_Id
            });
        }
    });

    updateTxn();
    return getTicketById(ticketId);
};

const getTicketHistory = (ticketId) => {
    getTicketById(ticketId);
    return historyRepository.findByTicketId(ticketId);
};

const getTicketResolution = (ticketId) => {
    getTicketById(ticketId);
    return resolutionRepository.findResolutionByTicketId(ticketId) || null;
};

/** Stored metrics plus the live resolution clock (an open segment keeps counting). */
const getTicketMetrics = (ticketId) => {
    const ticket = getTicketById(ticketId);
    const metrics = metricsRepository.findMetricsByTicketId(ticketId) || null;
    return { ...(metrics || {}), ...resolutionClock.getResolutionSummary(ticket) };
};

module.exports = {
    listTickets,
    getAgentQueue,
    getBankQueue,
    getTicketById,
    createTicket,
    updateTicket,
    getTicketHistory,
    getTicketResolution,
    getTicketMetrics,
    recordHistory
};
