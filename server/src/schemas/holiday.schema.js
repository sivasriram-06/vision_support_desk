const Joi = require("joi");

const DATE = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ "string.pattern.base": "Date must be YYYY-MM-DD" });

const holidayIdParamSchema = Joi.object({ holidayId: Joi.string().required() });
const listHolidaysQuerySchema = Joi.object({ year: Joi.number().integer().min(2000).max(2100) });
const createHolidaySchema = Joi.object({
    holidayDate: DATE.required(),
    holidayName: Joi.string().trim().min(2).max(100).required()
});
const updateHolidaySchema = Joi.object({
    holidayDate: DATE,
    holidayName: Joi.string().trim().min(2).max(100)
}).min(1);
const impactQuerySchema = Joi.object({ date: DATE.required(), remove: Joi.string().valid("true", "false") });
const holidaySettingsSchema = Joi.object({ applyTo24x7: Joi.boolean().required() });

module.exports = { holidayIdParamSchema, listHolidaysQuerySchema, createHolidaySchema, updateHolidaySchema, impactQuerySchema, holidaySettingsSchema };
