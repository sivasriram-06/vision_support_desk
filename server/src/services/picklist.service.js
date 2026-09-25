const { getDB } = require("../config/db");
const picklistRepository = require("../repositories/picklist.repository");
const ticketRepository = require("../repositories/ticket.repository");
const departmentRepository = require("../repositories/department.repository");
const resolutionClock = require("./sla/resolution-clock.service");
const organizationService = require("./organization.service");
const generateId = require("../utils/generate-id");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const { PICKLIST_FIELD } = require("../constants/picklist.constants");
const { CLOCK_BEHAVIOUR } = require("../constants/ticket.constants");

const listValues = (field, parentValue) => {
    const org = organizationService.getDefaultOrganization();
    return picklistRepository.findAll(org.Organization_Id, field, parentValue);
};

const getValueById = (picklistValueId) => {
    const value = picklistRepository.findById(picklistValueId);
    if (!value) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.PICKLIST_VALUE_NOT_FOUND, "Picklist value not found");
    }
    return value;
};

/**
 * Category is the only field with a parent: it's a sub-classification, and
 * the same Category text can validly repeat under different Classifications
 * (e.g. "Application" under both "Problem" and "Incident"), so uniqueness
 * and the dropdown options are scoped by parentValue instead of being
 * global like Classification/Status.
 */
const assertClassificationExists = (orgId, parentValue) => {
    const parent = picklistRepository.findByValue(orgId, PICKLIST_FIELD.CLASSIFICATION, parentValue);
    if (!parent) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.PICKLIST_PARENT_NOT_FOUND, "Classification not found");
    }
};

const createValue = (payload, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const value = payload.value.trim();
    const parentValue = payload.field === PICKLIST_FIELD.CATEGORY ? payload.parentValue.trim() : null;

    if (parentValue) {
        assertClassificationExists(org.Organization_Id, parentValue);
    }

    const existing = picklistRepository.findByValue(org.Organization_Id, payload.field, value, parentValue);
    if (existing) {
        throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_CODES.PICKLIST_VALUE_DUPLICATE, "This value already exists for the field");
    }

    const picklistValueId = generateId();
    picklistRepository.insert({
        Picklist_Value_Id: picklistValueId,
        Field: payload.field,
        Value: value,
        Parent_Value: parentValue,
        // A new status doesn't move the resolution clock until an admin says so.
        Clock_Behaviour: payload.field === PICKLIST_FIELD.STATUS ? (payload.clockBehaviour || CLOCK_BEHAVIOUR.NOT_STARTED) : null,
        Sort_Order: payload.sortOrder ?? 0,
        Created_By: actorAgentId,
        Org_Id: org.Organization_Id
    });
    return picklistRepository.findById(picklistValueId);
};

const updateValue = (picklistValueId, payload, actorAgentId) => {
    const existing = getValueById(picklistValueId);
    const org = organizationService.getDefaultOrganization();

    const nextValue = payload.value !== undefined ? payload.value.trim() : existing.Value;
    const nextParentValue = payload.parentValue !== undefined
        ? payload.parentValue.trim()
        : existing.Parent_Value;

    if (existing.Field === PICKLIST_FIELD.CATEGORY && payload.parentValue !== undefined) {
        assertClassificationExists(org.Organization_Id, nextParentValue);
    }

    if (payload.value !== undefined || payload.parentValue !== undefined) {
        const duplicate = picklistRepository.findByValue(org.Organization_Id, existing.Field, nextValue, nextParentValue);
        if (duplicate && duplicate.Picklist_Value_Id !== picklistValueId) {
            throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_CODES.PICKLIST_VALUE_DUPLICATE, "This value already exists for the field");
        }
    }

    const db = getDB();
    const updateTxn = db.transaction(() => {
        const changes = { Modified_By: actorAgentId };
        if (payload.value !== undefined) changes.Value = nextValue;
        if (payload.parentValue !== undefined) changes.Parent_Value = nextParentValue;
        if (payload.sortOrder !== undefined) changes.Sort_Order = payload.sortOrder;
        if (payload.clockBehaviour !== undefined) {
            if (existing.Field !== PICKLIST_FIELD.STATUS) {
                throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, "Clock behaviour only applies to Status values");
            }
            changes.Clock_Behaviour = payload.clockBehaviour;
        }
        picklistRepository.updateById(picklistValueId, changes);

        // Renaming a Classification: every Category whose Parent_Value
        // pointed at the old text needs to follow it, since that's a plain
        // text link (same precedent as Priority/Status not being FK ids).
        if (existing.Field === PICKLIST_FIELD.CLASSIFICATION && payload.value !== undefined && nextValue !== existing.Value) {
            picklistRepository.renameParentValue(org.Organization_Id, PICKLIST_FIELD.CATEGORY, existing.Value, nextValue, actorAgentId);
        }

        // Team type is plain text on the team row too - follow the rename.
        if (existing.Field === PICKLIST_FIELD.TEAM_TYPE && payload.value !== undefined && nextValue !== existing.Value) {
            departmentRepository.renameTeamType(org.Organization_Id, existing.Value, nextValue, actorAgentId);
        }

        if (existing.Field === PICKLIST_FIELD.STATUS) {
            // Status is stored on tickets as plain text too - a rename
            // carries every ticket along so none is left on a status that
            // no longer exists (which would drop it out of filters and the
            // edit dropdown).
            if (payload.value !== undefined && nextValue !== existing.Value) {
                ticketRepository.renameStatus(org.Organization_Id, existing.Value, nextValue, actorAgentId);
            }
            // New clock behaviour applies to tickets already in this status.
            if (payload.clockBehaviour !== undefined && payload.clockBehaviour !== existing.Clock_Behaviour) {
                resolutionClock.resyncTicketsInStatus({ orgId: org.Organization_Id, status: nextValue, actorAgentId });
            }
        }
    });
    updateTxn();

    return picklistRepository.findById(picklistValueId);
};

const deleteValue = (picklistValueId, actorAgentId) => {
    const existing = getValueById(picklistValueId);
    const org = organizationService.getDefaultOrganization();

    const db = getDB();
    const deleteTxn = db.transaction(() => {
        picklistRepository.softDeleteById(picklistValueId, actorAgentId);

        // Deleting a Classification takes its Categories with it - an
        // orphaned Category with no visible parent in the Config UI isn't
        // useful, and tickets that already used one keep the raw text
        // regardless (same precedent as Product/Priority deletion).
        if (existing.Field === PICKLIST_FIELD.CLASSIFICATION) {
            const children = picklistRepository.findByParentValue(org.Organization_Id, PICKLIST_FIELD.CATEGORY, existing.Value);
            for (const child of children) {
                picklistRepository.softDeleteById(child.Picklist_Value_Id, actorAgentId);
            }
        }
    });
    deleteTxn();
};

module.exports = { listValues, getValueById, createValue, updateValue, deleteValue };
