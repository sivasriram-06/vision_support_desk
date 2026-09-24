const Joi = require("joi");

const loginSchema = Joi.object({
    email: Joi.string().trim().email().required(),
    password: Joi.string().min(1).max(200).required()
});

const changePasswordSchema = Joi.object({
    currentPassword: Joi.string().min(1).max(200).required(),
    newPassword: Joi.string().min(1).max(200).required()
});

module.exports = { loginSchema, changePasswordSchema };
