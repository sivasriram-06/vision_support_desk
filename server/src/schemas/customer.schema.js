const Joi = require("joi");

const customerIdParamSchema = Joi.object({
    contactId: Joi.string().required()
});

const listCustomersQuerySchema = Joi.object({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    search: Joi.string().trim().max(200),
    letter: Joi.string().pattern(/^[A-Za-z#]$/),
    // A bank id, or "none" for customers without a bank.
    bankId: Joi.string()
});

// Email is intentionally not editable - see customer.service.js.
const updateCustomerSchema = Joi.object({
    name: Joi.string().trim().min(1).max(200),
    bankId: Joi.string().allow(null)
}).min(1);

module.exports = { customerIdParamSchema, listCustomersQuerySchema, updateCustomerSchema };
