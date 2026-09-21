const contactRepository = require("../repositories/contact.repository");
const organizationService = require("./organization.service");
const generateId = require("../utils/generate-id");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const { buildPaging } = require("../utils/pagination");

const listContacts = (query) => {
    const org = organizationService.getDefaultOrganization();
    const { rows, total, page, limit } = contactRepository.findAll(org.Organization_Id, query);
    return { data: rows, paging: buildPaging({ page, limit }, total) };
};

const getContactById = (contactId) => {
    const contact = contactRepository.findById(contactId);
    if (!contact) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.CONTACT_NOT_FOUND, "Contact not found");
    }
    return contact;
};

const createContact = (payload, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const contactId = generateId();

    contactRepository.insert({
        Contact_Id: contactId,
        First_Name: payload.firstName || null,
        Last_Name: payload.lastName,
        Email: payload.email || null,
        Phone: payload.phone || null,
        Account_Id: payload.accountId || null,
        Created_By: actorAgentId,
        Org_Id: org.Organization_Id
    });

    return getContactById(contactId);
};

/**
 * Used by the Gmail ingestion engine: reuses the existing contact for a
 * sender email when one exists, otherwise creates one from the From header.
 */
const findOrCreateBySender = ({ email, name }, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const existing = contactRepository.findByEmail(org.Organization_Id, email);
    if (existing) {
        return existing;
    }

    const [firstName, ...rest] = (name || email).trim().split(" ");
    const lastName = rest.join(" ") || firstName;

    return createContact({
        firstName: rest.length > 0 ? firstName : null,
        lastName,
        email
    }, actorAgentId);
};

module.exports = { listContacts, getContactById, createContact, findOrCreateBySender };
