const Joi = require("joi");
const { PICKLIST_FIELD } = require("../constants/picklist.constants");

const picklistIdParamSchema = Joi.object({
    picklistValueId: Joi.string().required()
});

const listPicklistQuerySchema = Joi.object({
    field: Joi.string().valid(...Object.values(PICKLIST_FIELD)).required(),
    parentValue: Joi.string().allow("")
});

const createPicklistSchema = Joi.object({
    field: Joi.string().valid(...Object.values(PICKLIST_FIELD)).required(),
    value: Joi.string().trim().min(1).max(120).required(),
    parentValue: Joi.string().trim().min(1).max(120)
        .when("field", { is: PICKLIST_FIELD.CATEGORY, then: Joi.required(), otherwise: Joi.forbidden() }),
    sortOrder: Joi.number().integer().min(0)
});

const updatePicklistSchema = Joi.object({
    value: Joi.string().trim().min(1).max(120),
    parentValue: Joi.string().trim().min(1).max(120),
    sortOrder: Joi.number().integer().min(0)
}).min(1);

module.exports = {
    picklistIdParamSchema,
    listPicklistQuerySchema,
    createPicklistSchema,
    updatePicklistSchema
};
