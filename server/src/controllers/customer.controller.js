const customerService = require("../services/customer.service");
const getActorAgentId = require("../utils/get-actor");
const HTTP_STATUS = require("../constants/http-status");
const { ok, okList } = require("../utils/api-response");

const listCustomers = (req, res, next) => {
    try {
        const { data, paging } = customerService.listCustomers(req.query);
        okList(res, HTTP_STATUS.OK, data, paging);
    } catch (error) {
        next(error);
    }
};

const getCustomer = (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.OK, customerService.getCustomer(req.params.contactId));
    } catch (error) {
        next(error);
    }
};

const updateCustomer = (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.OK, customerService.updateCustomer(req.params.contactId, req.body, getActorAgentId(req)));
    } catch (error) {
        next(error);
    }
};

module.exports = { listCustomers, getCustomer, updateCustomer };
