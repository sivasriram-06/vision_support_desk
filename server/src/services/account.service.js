const accountRepository = require("../repositories/account.repository");
const organizationService = require("./organization.service");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const { buildPaging } = require("../utils/pagination");

const listAccounts = (query) => {
    const org = organizationService.getDefaultOrganization();
    const { rows, total, page, limit } = accountRepository.findAll(org.Organization_Id, query);
    return { data: rows, paging: buildPaging({ page, limit }, total) };
};

const getAccountById = (accountId) => {
    const account = accountRepository.findById(accountId);
    if (!account) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.ACCOUNT_NOT_FOUND, "Account not found");
    }
    return account;
};

module.exports = { listAccounts, getAccountById };
