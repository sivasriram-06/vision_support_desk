const picklistService = require("../services/picklist.service");
const getActorAgentId = require("../utils/get-actor");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

const listValues = (req, res, next) => {
    try {
        const values = picklistService.listValues(req.query.field, req.query.parentValue);
        ok(res, HTTP_STATUS.OK, values);
    } catch (error) {
        next(error);
    }
};

const createValue = (req, res, next) => {
    try {
        const value = picklistService.createValue(req.body, getActorAgentId(req));
        ok(res, HTTP_STATUS.CREATED, value);
    } catch (error) {
        next(error);
    }
};

const updateValue = (req, res, next) => {
    try {
        const value = picklistService.updateValue(req.params.picklistValueId, req.body, getActorAgentId(req));
        ok(res, HTTP_STATUS.OK, value);
    } catch (error) {
        next(error);
    }
};

const deleteValue = (req, res, next) => {
    try {
        picklistService.deleteValue(req.params.picklistValueId, getActorAgentId(req));
        ok(res, HTTP_STATUS.OK, { deleted: true });
    } catch (error) {
        next(error);
    }
};

module.exports = { listValues, createValue, updateValue, deleteValue };
