const { getDB } = require("../config/db");
const ticketRepository = require("../repositories/ticket.repository");
const { history: historyRepository, metrics: metricsRepository } = require("../repositories/history.repository");
const departmentRepository = require("../repositories/department.repository");
const bankRepository = require("../repositories/bank.repository");
const contactRepository = require("../repositories/contact.repository");
const organizationService = require("./organization.service");
const { computeSlaDueDate } = require("./sla/sla.service");
const resolutionClock = require("./sla/resolution-clock.service");
const escalationService = require("./sla/escalation.service");
const generateId = require("../utils/generate-id");
const DB_TABLES = require("../constants/db-tables");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const { STATUS_TYPE, DEFAULT_STATUS_BY_TYPE, TICKET_HISTORY_EVENT, CLOCK_BEHAVIOUR } = require("../constants/ticket.constants");
const assignmentRepository = require("../repositories/ticket-assignment.repository");
const reopenRepository = require("../repositories/ticket-reopen.repository");
const holidayRepository = require("../repositories/holiday.repository");
const { isHolidayDate } = require("./sla/business-calendar");
const { buildPaging } = require("../utils/pagination");
const { publish, REALTIME_EVENT } = require("../realtime/bus");
const { nowIst, toIst } = require("../utils/time");

const nowIso = () => nowIst();

const recordHistory = ({ ticketId, eventName, fieldName = null, oldValue = null, newValue = null, actorAgentId, orgId, eventTime = null }) => {
    historyRepository.insert({
        History_Id: generateId(DB_TABLES.TICKET_HISTORY),
        Ticket_Id: ticketId,
        Event_Name: eventName,
        Field_Name: fieldName,
        Old_Value: oldValue !== null ? String(oldValue) : null,
        New_Value: newValue !== null ? String(newValue) : null,
        Actor_Agent_Id: actorAgentId,
        Event_Time: eventTime || nowIso(),
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

/** Ticket for the API: row plus current Assignees, display names and escalation level. */
const getTicketDetail = (ticketId) => {
    getTicketById(ticketId);
    return ticketRepository.findDetailById(ticketId);
};

// Ticket, initial history row and empty metrics row are written in one transaction.
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
        const ticketId = generateId(DB_TABLES.TICKET);
        const ticketNumber = ticketRepository.findNextTicketNumber(org.Organization_Id);
        // Email tickets date from Gmail receipt (internal callers only), clamped to now against clock skew.
        const sourceMs = payload.createdTime ? new Date(payload.createdTime).getTime() : NaN;
        const createdTime = Number.isNaN(sourceMs) ? nowIso() : toIst(Math.min(sourceMs, Date.now()));
        const statusType = payload.statusType || STATUS_TYPE.OPEN;
        const status = payload.status || DEFAULT_STATUS_BY_TYPE[statusType];
        const dueDate = computeSlaDueDate({ createdTime, priority: payload.priority, bankId: payload.bankId, orgId: org.Organization_Id });

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
            // Copied from the old ticket on "Create as new issue" (internal callers only - not in the API schema).
            Classification: payload.classification || null,
            Category: payload.category || null,
            Sub_Category: payload.subCategory || null,
            Product_Id: payload.productId || null,
            Split_From_Ticket_Id: payload.splitFromTicketId || null,
            Sla_Start_Time: createdTime,
            Response_Due_Date: dueDate,
            // Explicit IST ISO (same instant the SLA used); one format keeps text sorting right.
            Created_Time: createdTime,
            Created_By: actorAgentId,
            Org_Id: org.Organization_Id
        });

        recordHistory({
            ticketId,
            eventName: TICKET_HISTORY_EVENT.CREATED,
            actorAgentId,
            orgId: org.Organization_Id,
            eventTime: createdTime
        });

        metricsRepository.insert({
            Metric_Id: generateId(DB_TABLES.TICKET_METRICS),
            Ticket_Id: ticketId,
            Reopen_Count: 0,
            Created_By: actorAgentId,
            Org_Id: org.Organization_Id
        });

        // Start the resolution clock if created straight into a running status (email tickets aren't).
        const clockChanges = resolutionClock.applyStatusChange({
            ticket: { Ticket_Id: ticketId, Clock_State: "NOT_STARTED" },
            newStatus: status,
            bankId: payload.bankId,
            actorAgentId,
            orgId: org.Organization_Id
        });
        ticketRepository.updateById(ticketId, { ...clockChanges, Modified_By: actorAgentId });

        escalationService.rebuildTriggers(
            { Ticket_Id: ticketId, Priority: payload.priority, Bank_Id: payload.bankId, Response_Due_Date: dueDate },
            org.Organization_Id
        );

        return ticketId;
    });

    const ticketId = createTxn();
    publish({ type: REALTIME_EVENT.TICKET_CREATED, ticketId });
    return getTicketDetail(ticketId);
};

// Writes one HD_TICKET_HISTORY row per changed field.
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
        productId: "Product_Id",
        category: "Category",
        subCategory: "Sub_Category",
        classification: "Classification"
    };

    // One support team per bank: picking a bank routes to its team unless a department is set in the same request.
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

        historyEntries.push({ eventName, fieldName: column, oldValue, newValue });
    }

    // Due date is derived from Sla_Start_Time; recomputed on priority/bank change, never on status (no pause).
    const effectiveBankId = changes.Bank_Id !== undefined ? changes.Bank_Id : existing.Bank_Id;
    if (changes.Priority !== undefined || changes.Bank_Id !== undefined) {
        changes.Response_Due_Date = computeSlaDueDate({
            createdTime: existing.Sla_Start_Time || existing.Created_Time,
            priority: changes.Priority !== undefined ? changes.Priority : existing.Priority,
            bankId: effectiveBankId,
            orgId: org.Organization_Id
        });
    }

    if (Object.keys(changes).length === 0) {
        return getTicketDetail(ticketId);
    }

    // A Closed ticket comes back only through Reopen (records and counts it), never via the status list.
    const closingNow = changes.Status !== undefined && resolutionClock.clockBehaviourForStatus(org.Organization_Id, changes.Status) === CLOCK_BEHAVIOUR.STOPPED;
    if (changes.Status !== undefined && existing.Clock_State === CLOCK_BEHAVIOUR.STOPPED && !closingNow) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, "This ticket is Closed - use Reopen to open it again");
    }

    // Closing needs every current assignee's work Done, so tracking never shows open work on a closed ticket.
    if (closingNow) {
        const unfinished = assignmentRepository.findOpenUnfinished(ticketId);
        if (unfinished.length > 0) {
            const names = unfinished.map((a) => [a.First_Name, a.Last_Name].filter(Boolean).join(" ")).join(", ");
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, `Mark every assignee's work Done first - still open: ${names}`);
        }
    }

    const db = getDB();
    const updateTxn = db.transaction(() => {
        // Status drives the resolution clock - see services/sla/resolution-clock.service.js.
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
        const updated = ticketRepository.updateById(ticketId, changes);
        // A reopened round ends when the ticket closes again.
        if (closingNow && existing.Clock_State !== CLOCK_BEHAVIOUR.STOPPED) {
            reopenRepository.markClosedAgain(ticketId, changes.Closed_Time || nowIso());
        }
        // Escalation triggers hang off the due date, so they move with it.
        if (changes.Response_Due_Date !== undefined) {
            escalationService.rebuildTriggers(updated, org.Organization_Id);
        }
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
    publish({ type: REALTIME_EVENT.TICKET_CHANGED, ticketId, reason: Object.keys(changes).filter((c) => c !== "Modified_By").join(","), actorAgentId });
    return getTicketDetail(ticketId);
};

// Soft delete into the recycle bin; later mail in its thread opens a new ticket instead of reviving it.
const deleteTicket = (ticketId, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    getTicketById(ticketId);
    getDB().transaction(() => {
        ticketRepository.softDeleteById(ticketId, actorAgentId);
        recordHistory({ ticketId, eventName: TICKET_HISTORY_EVENT.TICKET_DELETED, actorAgentId, orgId: org.Organization_Id });
    })();
    publish({ type: REALTIME_EVENT.TICKET_DELETED, ticketId, actorAgentId });
    return { deleted: true, ticketId };
};

/** True when a person deleted the ticket (not the Gmail deletion sync) and it hasn't been restored since. */
const isDeletedByUser = (ticketId) =>
    ticketRepository.findLatestDeleteEvent(ticketId)?.Event_Name === TICKET_HISTORY_EVENT.TICKET_DELETED;

const getTicketHistory = (ticketId) => {
    getTicketById(ticketId);
    return historyRepository.findByTicketId(ticketId);
};

/** Stored metrics plus the live resolution clock (an open segment keeps counting) and escalation level. */
const getTicketMetrics = (ticketId) => {
    const ticket = getTicketById(ticketId);
    const metrics = metricsRepository.findMetricsByTicketId(ticketId) || null;
    return {
        ...(metrics || {}),
        ...resolutionClock.getResolutionSummary(ticket),
        escalation: escalationService.getTicketEscalation(ticket),
        holidaysInSla: holidaysInSla(ticket)
    };
};

// Company holidays inside the SLA window that its calendar skips - "Skips Christmas (25 Dec)".
const holidaysInSla = (ticket) => {
    if (!ticket.Response_Due_Date) return [];
    const from = (ticket.Sla_Start_Time || ticket.Created_Time).slice(0, 10);
    const to = ticket.Response_Due_Date.slice(0, 10);
    const calendar = resolutionClock.calendarForBankId(ticket.Bank_Id);
    return holidayRepository.findAll(ticket.Org_Id)
        .filter((h) => h.Holiday_Date >= from && h.Holiday_Date <= to && isHolidayDate(h.Holiday_Date, calendar))
        .map((h) => ({ date: h.Holiday_Date, name: h.Holiday_Name }));
};

/** Escalation queue: open tickets at level 1 or above, filterable by team / bank / priority. */
const listEscalatedTickets = (query) => {
    const org = organizationService.getDefaultOrganization();
    return ticketRepository.findEscalated(org.Organization_Id, query);
};

module.exports = {
    listTickets,
    getAgentQueue,
    getBankQueue,
    getTicketById,
    getTicketDetail,
    createTicket,
    updateTicket,
    deleteTicket,
    isDeletedByUser,
    getTicketHistory,
    getTicketMetrics,
    listEscalatedTickets,
    recordHistory
};
