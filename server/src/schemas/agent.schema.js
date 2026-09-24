const Joi = require("joi");

const agentIdParamSchema = Joi.object({
    agentId: Joi.string().required()
});

const createAgentSchema = Joi.object({
    firstName: Joi.string().trim().min(1).max(150).required(),
    lastName: Joi.string().trim().max(150).allow("", null),
    email: Joi.string().trim().email().required(),
    departmentId: Joi.string().allow(null),
    roleId: Joi.string().allow(null)
});

const updateAgentSchema = Joi.object({
    firstName: Joi.string().trim().min(1).max(150),
    lastName: Joi.string().trim().max(150).allow("", null),
    email: Joi.string().trim().email(),
    departmentId: Joi.string().allow(null),
    roleId: Joi.string().allow(null),
    status: Joi.string().valid("Active", "Inactive")
}).min(1);

module.exports = { agentIdParamSchema, createAgentSchema, updateAgentSchema };
