const Joi = require("joi");
const { STATUS_TYPE, PRIORITY, CHANNEL } = require("../constants/ticket.constants");

const ticketIdParamSchema = Joi.object({
    ticketId: Joi.string().required()
});

const createTicketSchema = Joi.object({
    subject: Joi.string().max(500).required(),
    description: Joi.string().allow("", null),
    channel: Joi.string().valid(...Object.values(CHANNEL)).required(),
    departmentId: Joi.string().required(),
    teamId: Joi.string().allow(null),
    contactId: Joi.string().required(),
    accountId: Joi.string().allow(null),
    assigneeId: Joi.string().allow(null),
    status: Joi.string().allow(null),
    statusType: Joi.string().valid(...Object.values(STATUS_TYPE)),
    priority: Joi.string().valid(...Object.values(PRIORITY)).allow(null)
});

const updateTicketSchema = Joi.object({
    subject: Joi.string().max(500),
    description: Joi.string().allow("", null),
    status: Joi.string(),
    statusType: Joi.string().valid(...Object.values(STATUS_TYPE)),
    priority: Joi.string().valid(...Object.values(PRIORITY)).allow(null),
    departmentId: Joi.string(),
    teamId: Joi.string().allow(null),
    assigneeId: Joi.string().allow(null),
    category: Joi.string().allow("", null),
    subCategory: Joi.string().allow("", null),
    classification: Joi.string().allow("", null)
}).min(1);

const listTicketsQuerySchema = Joi.object({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    status: Joi.string(),
    statusType: Joi.string().valid(...Object.values(STATUS_TYPE)),
    priority: Joi.string().valid(...Object.values(PRIORITY)),
    departmentId: Joi.string(),
    teamId: Joi.string(),
    assigneeId: Joi.string(),
    contactId: Joi.string(),
    search: Joi.string(),
    sortBy: Joi.string(),
    sortOrder: Joi.string().valid("asc", "desc", "ASC", "DESC"),
    unassignedOnly: Joi.string().valid("true", "false")
});

module.exports = {
    ticketIdParamSchema,
    createTicketSchema,
    updateTicketSchema,
    listTicketsQuerySchema
};
