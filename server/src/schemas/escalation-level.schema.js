const Joi = require("joi");

const escalationLevelIdParamSchema = Joi.object({
    escalationLevelId: Joi.string().required()
});

// Hours from the SLA due date: negative = before, 0 = at, positive = after; bounded to a year.
const offsetHours = Joi.number().min(-8760).max(8760).precision(2);

const createEscalationLevelSchema = Joi.object({
    priority: Joi.string().trim().min(1).max(30).required(),
    levelNo: Joi.number().integer().min(1).max(50).required(),
    offsetHours: offsetHours.required()
});

const updateEscalationLevelSchema = Joi.object({
    offsetHours: offsetHours.required()
});

module.exports = { escalationLevelIdParamSchema, createEscalationLevelSchema, updateEscalationLevelSchema };
