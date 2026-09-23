const Joi = require("joi");

const teamIdParamSchema = Joi.object({
    teamId: Joi.string().required()
});

const createTeamSchema = Joi.object({
    teamName: Joi.string().trim().min(1).max(150).required(),
    departmentId: Joi.string().required()
});

const updateTeamSchema = Joi.object({
    teamName: Joi.string().trim().min(1).max(150),
    departmentId: Joi.string()
}).min(1);

module.exports = { teamIdParamSchema, createTeamSchema, updateTeamSchema };
