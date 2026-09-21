const accountService = require("../services/account.service");
const HTTP_STATUS = require("../constants/http-status");
const { ok, okList } = require("../utils/api-response");

const listAccounts = (req, res, next) => {
    try {
        const { data, paging } = accountService.listAccounts(req.query);
        okList(res, HTTP_STATUS.OK, data, paging);
    } catch (error) {
        next(error);
    }
};

const getAccountById = (req, res, next) => {
    try {
        const account = accountService.getAccountById(req.params.accountId);
        ok(res, HTTP_STATUS.OK, account);
    } catch (error) {
        next(error);
    }
};

module.exports = { listAccounts, getAccountById };
