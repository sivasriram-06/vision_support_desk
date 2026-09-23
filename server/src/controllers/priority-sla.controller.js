const prioritySlaService = require("../services/priority-sla.service");
const getActorAgentId = require("../utils/get-actor");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

const listConfig = (req, res, next) => {
    try {
        const config = prioritySlaService.listConfig();
        ok(res, HTTP_STATUS.OK, config);
    } catch (error) {
        next(error);
    }
};

const createConfig = (req, res, next) => {
    try {
        const config = prioritySlaService.createConfig(req.body.priority, req.body.slaHours, getActorAgentId(req));
        ok(res, HTTP_STATUS.CREATED, config);
    } catch (error) {
        next(error);
    }
};

const upsertConfig = (req, res, next) => {
    try {
        const config = prioritySlaService.upsertConfig(req.params.priority, req.body.slaHours, getActorAgentId(req));
        ok(res, HTTP_STATUS.OK, config);
    } catch (error) {
        next(error);
    }
};

const deleteConfig = (req, res, next) => {
    try {
        prioritySlaService.deleteConfig(req.params.priority, getActorAgentId(req));
        ok(res, HTTP_STATUS.OK, { deleted: true });
    } catch (error) {
        next(error);
    }
};

module.exports = { listConfig, createConfig, upsertConfig, deleteConfig };
