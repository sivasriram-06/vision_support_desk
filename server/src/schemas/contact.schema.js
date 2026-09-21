const Joi = require("joi");

const createContactSchema = Joi.object({
    firstName: Joi.string().allow("", null),
    lastName: Joi.string().required(),
    email: Joi.string().email().allow(null),
    phone: Joi.string().allow("", null),
    accountId: Joi.string().allow(null)
});

const listContactsQuerySchema = Joi.object({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    search: Joi.string()
});

module.exports = { createContactSchema, listContactsQuerySchema };
