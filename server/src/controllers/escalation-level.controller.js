const escalationLevelService = require("../services/escalation-level.service");
const getActorAgentId = require("../utils/get-actor");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

const listLevels = (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.OK, escalationLevelService.listLevels());
    } catch (error) {
        next(error);
    }
};

const createLevel = (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.CREATED, escalationLevelService.createLevel(req.body, getActorAgentId(req)));
    } catch (error) {
        next(error);
    }
};

const updateLevel = (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.OK, escalationLevelService.updateLevel(req.params.escalationLevelId, req.body, getActorAgentId(req)));
    } catch (error) {
        next(error);
    }
};

const deleteLevel = (req, res, next) => {
    try {
        escalationLevelService.deleteLevel(req.params.escalationLevelId, getActorAgentId(req));
        ok(res, HTTP_STATUS.OK, { deleted: true });
    } catch (error) {
        next(error);
    }
};

module.exports = { listLevels, createLevel, updateLevel, deleteLevel };
