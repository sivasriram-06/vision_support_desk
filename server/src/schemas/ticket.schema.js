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
    assigneeId: Joi.string().allow(null),
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
    assigneeId: Joi.string().allow(null),
    productId: Joi.string().allow(null),
    category: Joi.string().allow("", null),
    subCategory: Joi.string().allow("", null),
    classification: Joi.string().allow("", null),
    dueDate: Joi.string().isoDate().allow(null)
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
    slaBreached: Joi.string().valid("true", "false")
});

module.exports = {
    ticketIdParamSchema,
    createTicketSchema,
    updateTicketSchema,
    listTicketsQuerySchema
};
