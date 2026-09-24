const roleRepository = require("../repositories/role.repository");
const organizationService = require("./organization.service");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const { PERMISSION_CATALOG, ALL_PERMISSION_KEYS, ROLE_KEYS } = require("../constants/permissions");

const parsePermissions = (json) => {
    if (!json) return [];
    try {
        const parsed = JSON.parse(json);
        return Array.isArray(parsed) ? parsed.filter((key) => ALL_PERMISSION_KEYS.includes(key)) : [];
    } catch {
        return [];
    }
};

/**
 * Effective permission keys for a role row. Admin always has everything -
 * that role is not editable, so an admin can never lock themselves out of
 * the Admin page. A missing/legacy role grants nothing.
 */
const getRolePermissions = (role) => {
    if (!role || !role.Role_Key) return [];
    if (role.Role_Key === ROLE_KEYS.ADMIN) return [...ALL_PERMISSION_KEYS];
    return parsePermissions(role.Permissions_Json);
};

const toRoleDto = (role) => ({
    Role_Id: role.Role_Id,
    Role_Name: role.Role_Name,
    Role_Key: role.Role_Key,
    Sort_Order: role.Sort_Order,
    Is_Locked: role.Role_Key === ROLE_KEYS.ADMIN,
    permissions: getRolePermissions(role)
});

const listRoles = () => {
    const org = organizationService.getDefaultOrganization();
    return roleRepository.findAllKeyed(org.Organization_Id).map(toRoleDto);
};

const getPermissionCatalog = () => PERMISSION_CATALOG;

const getKeyedRoleById = (roleId) => {
    const role = roleRepository.findById(roleId);
    if (!role || !role.Role_Key) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.ROLE_NOT_FOUND, "Role not found");
    }
    return role;
};

const updateRolePermissions = (roleId, permissions, actorAgentId) => {
    const role = getKeyedRoleById(roleId);
    if (role.Role_Key === ROLE_KEYS.ADMIN) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, "The Admin role always has full access and cannot be edited");
    }
    const unknown = permissions.filter((key) => !ALL_PERMISSION_KEYS.includes(key));
    if (unknown.length > 0) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, `Unknown permission(s): ${unknown.join(", ")}`);
    }
    const unique = ALL_PERMISSION_KEYS.filter((key) => permissions.includes(key));
    roleRepository.updateById(roleId, { Permissions_Json: JSON.stringify(unique), Modified_By: actorAgentId });
    return toRoleDto(roleRepository.findById(roleId));
};

module.exports = { getRolePermissions, listRoles, getPermissionCatalog, getKeyedRoleById, updateRolePermissions };
