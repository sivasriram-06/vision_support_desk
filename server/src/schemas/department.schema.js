const Joi = require("joi");

const departmentIdParamSchema = Joi.object({
    departmentId: Joi.string().required()
});

// Team type comes from the Config TEAM_TYPE list, checked in department.service.js.
const createDepartmentSchema = Joi.object({
    departmentName: Joi.string().trim().min(1).max(150).required(),
    teamType: Joi.string().trim().max(60).allow(null, "")
});

const updateDepartmentSchema = Joi.object({
    departmentName: Joi.string().trim().min(1).max(150).required(),
    teamType: Joi.string().trim().max(60).allow(null, "")
});

module.exports = { departmentIdParamSchema, createDepartmentSchema, updateDepartmentSchema };
