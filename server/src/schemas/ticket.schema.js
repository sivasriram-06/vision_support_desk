const Joi = require("joi");
const { STATUS_TYPE, CHANNEL } = require("../constants/ticket.constants");

// Priority is an admin-managed list (see HD_PRIORITY_SLA_CONFIG /
// priority-sla.service.js), not a fixed enum, so it's validated as a plain
// string here rather than against ticket.constants.js's PRIORITY.

const ticketIdParamSchema = Joi.object({
    ticketId: Joi.string().required()
});

const createTicketSchema = Joi.object({
    subject: Joi.string().max(500).required(),
    description: Joi.string().allow("", null),
    channel: Joi.string().valid(...Object.values(CHANNEL)).required(),
    departmentId: Joi.string().required(),
    bankId: Joi.string().allow(null),
    contactId: Joi.string().required(),
    accountId: Joi.string().allow(null),
    status: Joi.string().allow(null),
    statusType: Joi.string().valid(...Object.values(STATUS_TYPE)),
    priority: Joi.string().max(30).allow(null)
});

const updateTicketSchema = Joi.object({
    subject: Joi.string().max(500),
    description: Joi.string().allow("", null),
    status: Joi.string(),
    priority: Joi.string().max(30).allow(null),
    departmentId: Joi.string(),
    bankId: Joi.string().allow(null),
    productId: Joi.string().allow(null),
    category: Joi.string().allow("", null),
    subCategory: Joi.string().allow("", null),
    classification: Joi.string().allow("", null)
}).min(1);

const listTicketsQuerySchema = Joi.object({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    status: Joi.string(),
    statusType: Joi.string().valid(...Object.values(STATUS_TYPE)),
    priority: Joi.string().max(30),
    departmentId: Joi.string(),
    bankId: Joi.string(),
    assigneeId: Joi.string(),
    contactId: Joi.string(),
    search: Joi.string(),
    sortBy: Joi.string(),
    sortOrder: Joi.string().valid("asc", "desc", "ASC", "DESC"),
    unassignedOnly: Joi.string().valid("true", "false"),
    slaBreached: Joi.string().valid("true", "false"),
    escalationLevel: Joi.alternatives().try(Joi.string().valid("any"), Joi.number().integer().min(1))
});

const addAssigneesSchema = Joi.object({
    agentIds: Joi.array().items(Joi.string()).min(1).unique().required(),
    note: Joi.string().trim().max(500).allow("", null)
});

const assigneeParamSchema = Joi.object({
    ticketId: Joi.string().required(),
    agentId: Joi.string().required()
});

const workStateSchema = Joi.object({
    state: Joi.string().valid("IN_PROGRESS", "ON_HOLD", "DONE").required(),
    note: Joi.string().trim().max(500).allow("", null)
});

const dependencySchema = Joi.object({
    blockerAgentId: Joi.string().required()
});

const dependencyParamSchema = Joi.object({
    ticketId: Joi.string().required(),
    agentId: Joi.string().required(),
    blockerAgentId: Joi.string().required()
});

const worklogSchema = Joi.object({
    minutes: Joi.number().integer().min(1).max(24 * 60).required(),
    workDate: Joi.string().isoDate(),
    note: Joi.string().trim().max(1000).allow("", null)
});

const worklogParamSchema = Joi.object({
    ticketId: Joi.string().required(),
    worklogId: Joi.string().required()
});

const myTicketsQuerySchema = Joi.object({
    scope: Joi.string().valid("assigned", "assignedBy", "team").default("assigned"),
    includeClosed: Joi.string().valid("true", "false")
});

const escalatedTicketsQuerySchema = Joi.object({
    departmentId: Joi.string(),
    bankId: Joi.string(),
    priority: Joi.string().max(30)
});

module.exports = {
    ticketIdParamSchema,
    createTicketSchema,
    updateTicketSchema,
    listTicketsQuerySchema,
    escalatedTicketsQuerySchema,
    addAssigneesSchema,
    assigneeParamSchema,
    myTicketsQuerySchema,
    workStateSchema,
    dependencySchema,
    dependencyParamSchema,
    worklogSchema,
    worklogParamSchema
};
