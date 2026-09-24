const bankService = require("../services/bank.service");
const getActorAgentId = require("../utils/get-actor");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

const listBanks = (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.OK, bankService.listBanks(req.query));
    } catch (error) {
        next(error);
    }
};

const getBankById = (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.OK, bankService.getBankById(req.params.bankId));
    } catch (error) {
        next(error);
    }
};

const createBank = (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.CREATED, bankService.createBank(req.body, getActorAgentId(req)));
    } catch (error) {
        next(error);
    }
};

const updateBank = (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.OK, bankService.updateBank(req.params.bankId, req.body, getActorAgentId(req)));
    } catch (error) {
        next(error);
    }
};

const deleteBank = (req, res, next) => {
    try {
        bankService.deleteBank(req.params.bankId, getActorAgentId(req));
        ok(res, HTTP_STATUS.OK, { deleted: true });
    } catch (error) {
        next(error);
    }
};

module.exports = { listBanks, getBankById, createBank, updateBank, deleteBank };
