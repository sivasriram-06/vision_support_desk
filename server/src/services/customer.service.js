const customerRepository = require("../repositories/customer.repository");
const contactRepository = require("../repositories/contact.repository");
const bankRepository = require("../repositories/bank.repository");
const organizationService = require("./organization.service");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const { buildPaging } = require("../utils/pagination");
const { publish, REALTIME_EVENT } = require("../realtime/bus");

/**
 * Customers page (customers.manage). Customers are never created here -
 * the Gmail sync adds one per sender address. Leads may fix the name and
 * set the bank; the email stays read-only because it's how the sync
 * matches the next mail to this customer (editing it would spawn a
 * duplicate on the sender's next mail).
 */

const listCustomers = (query) => {
    const org = organizationService.getDefaultOrganization();
    const { rows, total, page, limit } = customerRepository.findAll(org.Organization_Id, query);
    return { data: rows, paging: buildPaging({ page, limit }, total) };
};

const getCustomer = (contactId) => {
    const customer = customerRepository.findById(contactId);
    if (!customer) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.CONTACT_NOT_FOUND, "Customer not found");
    }
    return customer;
};

const updateCustomer = (contactId, payload, actorAgentId) => {
    getCustomer(contactId);

    if (payload.bankId && !bankRepository.findById(payload.bankId)) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.BANK_NOT_FOUND, "Bank not found");
    }

    const changes = { Modified_By: actorAgentId };
    if (payload.name !== undefined) {
        // Split the way ingestion splits a From name: first word is the
        // first name, the rest the last name; one word = last name only.
        const [first, ...rest] = payload.name.trim().split(/\s+/);
        changes.First_Name = rest.length > 0 ? first : null;
        changes.Last_Name = rest.length > 0 ? rest.join(" ") : first;
    }
    if (payload.bankId !== undefined) changes.Bank_Id = payload.bankId || null;
    contactRepository.updateById(contactId, changes);
    publish({ type: REALTIME_EVENT.CUSTOMER_CHANGED, contactId, actorAgentId });

    return getCustomer(contactId);
};

module.exports = { listCustomers, getCustomer, updateCustomer };
