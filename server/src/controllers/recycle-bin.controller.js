const recycleBinService = require("../services/recycle-bin.service");
const getActorAgentId = require("../utils/get-actor");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

const listRecycleBin = (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.OK, recycleBinService.listRecycleBin());
    } catch (error) {
        next(error);
    }
};

const restoreTicket = (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.OK, recycleBinService.restoreTicket(req.params.ticketId, getActorAgentId(req)));
    } catch (error) {
        next(error);
    }
};

module.exports = { listRecycleBin, restoreTicket };
