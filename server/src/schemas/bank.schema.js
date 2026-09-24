const Joi = require("joi");

const SUPPORT_LEVELS = ["Platinum", "Gold", "Silver"];

const bankIdParamSchema = Joi.object({
    bankId: Joi.string().required()
});

const text = (max) => Joi.string().trim().max(max).allow("", null);

const bankDetailFields = {
    country: text(100),
    module: text(100),
    supportLevel: Joi.string().valid(...SUPPORT_LEVELS).allow(null, ""),
    supportDays: text(100),
    supportHoursLocal: text(100),
    supportHoursIst: text(100),
    is24x7: Joi.boolean(),
    remarks: text(1000),
    primaryResourceIds: Joi.array().items(Joi.string()).unique(),
    secondaryResourceIds: Joi.array().items(Joi.string()).unique()
};

const createBankSchema = Joi.object({
    bankName: Joi.string().trim().min(1).max(150).required(),
    departmentId: Joi.string().required(),
    ...bankDetailFields
});

const updateBankSchema = Joi.object({
    bankName: Joi.string().trim().min(1).max(150),
    departmentId: Joi.string(),
    ...bankDetailFields
}).min(1);

module.exports = { SUPPORT_LEVELS, bankIdParamSchema, createBankSchema, updateBankSchema };
