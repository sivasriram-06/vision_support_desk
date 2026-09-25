const Joi = require("joi");

const SUPPORT_LEVELS = ["Platinum", "Gold", "Silver"];
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const bankIdParamSchema = Joi.object({
    bankId: Joi.string().required()
});

const text = (max) => Joi.string().trim().max(max).allow("", null);
// 24h "HH:MM" - the support window in IST.
const hhmm = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).messages({ "string.pattern.base": "{#label} must be a time like 10:30" });

const bankDetailFields = {
    country: text(100),
    module: text(100),
    supportLevel: Joi.string().valid(...SUPPORT_LEVELS).allow(null, ""),
    workingDays: Joi.array().items(Joi.string().valid(...WEEKDAYS)).min(1).unique(),
    timeZone: Joi.string().trim().max(64),
    supportStartIst: hhmm,
    supportEndIst: hhmm,
    is24x7: Joi.boolean(),
    remarks: text(1000),
    primaryResourceIds: Joi.array().items(Joi.string()).unique(),
    secondaryResourceIds: Joi.array().items(Joi.string()).unique()
};

const createBankSchema = Joi.object({
    bankName: Joi.string().trim().min(1).max(150).required(),
    departmentId: Joi.string().required(),
    ...bankDetailFields,
    supportStartIst: hhmm.required(),
    supportEndIst: hhmm.required()
});

const updateBankSchema = Joi.object({
    bankName: Joi.string().trim().min(1).max(150),
    departmentId: Joi.string(),
    ...bankDetailFields
}).min(1);

module.exports = { SUPPORT_LEVELS, bankIdParamSchema, createBankSchema, updateBankSchema };
