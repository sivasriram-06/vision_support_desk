const contactService = require("../services/contact.service");
const getActorAgentId = require("../utils/get-actor");
const HTTP_STATUS = require("../constants/http-status");
const { ok, okList } = require("../utils/api-response");

const listContacts = (req, res, next) => {
    try {
        const { data, paging } = contactService.listContacts(req.query);
        okList(res, HTTP_STATUS.OK, data, paging);
    } catch (error) {
        next(error);
    }
};

const getContactById = (req, res, next) => {
    try {
        const contact = contactService.getContactById(req.params.contactId);
        ok(res, HTTP_STATUS.OK, contact);
    } catch (error) {
        next(error);
    }
};

const createContact = (req, res, next) => {
    try {
        const contact = contactService.createContact(req.body, getActorAgentId(req));
        ok(res, HTTP_STATUS.CREATED, contact);
    } catch (error) {
        next(error);
    }
};

module.exports = { listContacts, getContactById, createContact };
