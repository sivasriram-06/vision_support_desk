const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const { PERMISSIONS } = require("../constants/permissions");

const PROPERTY_FIELDS = {
    subject: "Subject",
    description: "Description",
    priority: "Priority",
    departmentId: "Department_Id",
    bankId: "Bank_Id",
    productId: "Product_Id",
    category: "Category",
    subCategory: "Sub_Category",
    classification: "Classification"
};

const forbidden = (message) => new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, message);

const normalize = (value) => (value === undefined || value === "" ? null : value);

const isChanged = (key, payload, existing, column) => {
    if (payload[key] === undefined) return false;
    return normalize(payload[key]) !== normalize(existing[column]);
};

/**
 * Field-level authorization for PATCH /tickets/:id. Only fields that
 * actually change are checked, so a Team Member re-saving the panel with
 * an unchanged priority isn't refused for "editing properties".
 *
 *   Status                -> tickets.edit_status
 *   Everything else       -> tickets.edit_properties (incl. Bank)
 *
 * Assignees are not a PATCH field - see ticket-assignment.service.js.
 */
const assertCanUpdateTicket = (actor, existing, payload) => {
    const has = (key) => actor.permissions.includes(key);

    if (isChanged("status", payload, existing, "Status") && !has(PERMISSIONS.TICKETS_EDIT_STATUS)) {
        throw forbidden("You do not have permission to change ticket status");
    }

    const changedProperties = Object.entries(PROPERTY_FIELDS).filter(([key, column]) => isChanged(key, payload, existing, column));
    if (changedProperties.length > 0 && !has(PERMISSIONS.TICKETS_EDIT_PROPERTIES)) {
        throw forbidden("You do not have permission to edit ticket properties");
    }
};

module.exports = { assertCanUpdateTicket };
