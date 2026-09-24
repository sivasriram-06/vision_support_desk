const Joi = require("joi");

const roleIdParamSchema = Joi.object({
    roleId: Joi.string().required()
});

const agentIdParamSchema = Joi.object({
    agentId: Joi.string().required()
});

const updateRolePermissionsSchema = Joi.object({
    permissions: Joi.array().items(Joi.string()).required()
});

const setPasswordSchema = Joi.object({
    password: Joi.string().min(1).max(200).required()
});

module.exports = { roleIdParamSchema, agentIdParamSchema, updateRolePermissionsSchema, setPasswordSchema };
