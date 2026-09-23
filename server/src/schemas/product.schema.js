const Joi = require("joi");

const productIdParamSchema = Joi.object({
    productId: Joi.string().required()
});

const createProductSchema = Joi.object({
    productName: Joi.string().trim().min(1).max(150).required(),
    description: Joi.string().allow("", null),
    departmentId: Joi.string().allow(null)
});

const updateProductSchema = Joi.object({
    productName: Joi.string().trim().min(1).max(150),
    description: Joi.string().allow("", null),
    departmentId: Joi.string().allow(null)
}).min(1);

module.exports = { productIdParamSchema, createProductSchema, updateProductSchema };
