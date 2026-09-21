const { getDB } = require("../config/db");
const ticketRepository = require("../repositories/ticket.repository");
const { history: historyRepository, resolution: resolutionRepository, metrics: metricsRepository } = require("../repositories/history.repository");
const departmentRepository = require("../repositories/department.repository");
const contactRepository = require("../repositories/contact.repository");
const organizationService = require("./organization.service");
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

const getTeamQueue = (teamId, query) => {
    const org = organizationService.getDefaultOrganization();
    const { rows, total, page, limit } = ticketRepository.findTeamQueue(org.Organization_Id, teamId, query);
    return { data: rows, paging: buildPaging({ page, limit }, total) };
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
        const statusType = payload.statusType || STATUS_TYPE.OPEN;

        ticketRepository.insert({
            Ticket_Id: ticketId,
            Ticket_Number: ticketNumber,
            Subject: payload.subject,
            Description: payload.description || null,
            Status: payload.status || DEFAULT_STATUS_BY_TYPE[statusType],
            Status_Type: statusType,
            Priority: payload.priority || null,
            Channel: payload.channel,
            Department_Id: payload.departmentId,
            Team_Id: payload.teamId || null,
            Contact_Id: payload.contactId,
            Account_Id: payload.accountId || null,
            Assignee_Id: payload.assigneeId || null,
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
        statusType: "Status_Type",
        priority: "Priority",
        departmentId: "Department_Id",
        teamId: "Team_Id",
        assigneeId: "Assignee_Id",
        category: "Category",
        subCategory: "Sub_Category",
        classification: "Classification"
    };

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

        let eventName = TICKET_HISTORY_EVENT.STATUS_CHANGE;
        if (column === "Priority") eventName = TICKET_HISTORY_EVENT.PRIORITY_CHANGE;
        else if (column === "Assignee_Id") eventName = TICKET_HISTORY_EVENT.REASSIGNED;
        else if (column !== "Status" && column !== "Status_Type") eventName = "FIELD_CHANGE";

        historyEntries.push({ eventName, fieldName: column, oldValue, newValue });
    }

    if (Object.keys(changes).length === 0) {
        return existing;
    }

    const db = getDB();
    const updateTxn = db.transaction(() => {
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

const getTicketMetrics = (ticketId) => {
    getTicketById(ticketId);
    return metricsRepository.findMetricsByTicketId(ticketId) || null;
};

module.exports = {
    listTickets,
    getAgentQueue,
    getTeamQueue,
    getTicketById,
    createTicket,
    updateTicket,
    getTicketHistory,
    getTicketResolution,
    getTicketMetrics,
    recordHistory
};
