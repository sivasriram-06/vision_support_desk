const Joi = require("joi");

const addReplySchema = Joi.object({
    content: Joi.string().required(),
    channel: Joi.string(),
    isPublic: Joi.boolean(),
    toAddress: Joi.string().allow("", null),
    ccAddress: Joi.string().allow("", null)
});

const addCommentSchema = Joi.object({
    content: Joi.string().required()
});

module.exports = { addReplySchema, addCommentSchema };
