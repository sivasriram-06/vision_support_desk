const Joi = require("joi");

const priorityParamSchema = Joi.object({
    priority: Joi.string().max(30).required()
});

const createPrioritySlaSchema = Joi.object({
    priority: Joi.string().trim().min(1).max(30).required(),
    slaHours: Joi.number().integer().min(1).max(8760).required() // 8760h = 1 year, sane upper bound
});

const upsertPrioritySlaSchema = Joi.object({
    slaHours: Joi.number().integer().min(1).max(8760).required()
});

module.exports = { priorityParamSchema, createPrioritySlaSchema, upsertPrioritySlaSchema };
