const Joi = require("joi");

const agentIdParamSchema = Joi.object({
    agentId: Joi.string().required()
});

const createAgentSchema = Joi.object({
    firstName: Joi.string().trim().min(1).max(150).required(),
    lastName: Joi.string().trim().min(1).max(150).required(),
    email: Joi.string().trim().email().required(),
    departmentId: Joi.string().allow(null)
});

const updateAgentSchema = Joi.object({
    firstName: Joi.string().trim().min(1).max(150),
    lastName: Joi.string().trim().min(1).max(150),
    departmentId: Joi.string().allow(null),
    status: Joi.string().valid("Active", "Inactive")
}).min(1);

module.exports = { agentIdParamSchema, createAgentSchema, updateAgentSchema };
