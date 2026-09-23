const Joi = require("joi");

const departmentIdParamSchema = Joi.object({
    departmentId: Joi.string().required()
});

const createDepartmentSchema = Joi.object({
    departmentName: Joi.string().trim().min(1).max(150).required()
});

const updateDepartmentSchema = Joi.object({
    departmentName: Joi.string().trim().min(1).max(150).required()
});

module.exports = { departmentIdParamSchema, createDepartmentSchema, updateDepartmentSchema };
