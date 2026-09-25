const agentRepository = require("../repositories/agent.repository");
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
 *   Assignee              -> tickets.assign_any, or tickets.assign_team
 *                            limited to agents in the actor's own team
 *   Everything else       -> tickets.edit_properties (incl. Bank)
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

    const assigneeChanged = isChanged("assigneeId", payload, existing, "Assignee_Id");
    if (!assigneeChanged) return;
    if (has(PERMISSIONS.TICKETS_ASSIGN_ANY)) return;
    if (!has(PERMISSIONS.TICKETS_ASSIGN_TEAM)) {
        throw forbidden("You do not have permission to assign tickets");
    }

    const newAssigneeId = normalize(payload.assigneeId);
    if (newAssigneeId) {
        const assignee = agentRepository.findById(newAssigneeId);
        if (!actor.teamId || !assignee || assignee.Primary_Department_Id !== actor.teamId) {
            throw forbidden("You can only assign tickets to members of your own team");
        }
        if (assignee.Status !== "Active") {
            throw forbidden("This agent is inactive and can't be assigned tickets");
        }
    }
};

module.exports = { assertCanUpdateTicket };
