const departmentRepository = require("../repositories/department.repository");
const picklistRepository = require("../repositories/picklist.repository");
const { PICKLIST_FIELD } = require("../constants/picklist.constants");
const organizationService = require("./organization.service");
const generateId = require("../utils/generate-id");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");

const sanitizeName = (name) =>
    name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

/** Team type must be one of the Config page's TEAM_TYPE values (or blank). */
const resolveTeamType = (orgId, teamType) => {
    if (teamType === undefined) return undefined;
    const value = (teamType || "").trim();
    if (!value) return null;
    if (!picklistRepository.findByValue(orgId, PICKLIST_FIELD.TEAM_TYPE, value)) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, `Unknown team type "${value}" - add it on the Config page first`);
    }
    return value;
};

const listDepartments = () => {
    const org = organizationService.getDefaultOrganization();
    return departmentRepository.findAll(org.Organization_Id);
};

const getDepartmentById = (departmentId) => {
    const department = departmentRepository.findById(departmentId);
    if (!department) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.DEPARTMENT_NOT_FOUND, "Department not found");
    }
    return department;
};

const createDepartment = (payload, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const departmentName = payload.departmentName.trim();
    const sanitizedName = sanitizeName(departmentName);

    const existing = departmentRepository.findBySanitizedName(org.Organization_Id, sanitizedName);
    if (existing) {
        throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_CODES.DEPARTMENT_DUPLICATE, "A department with this name already exists");
    }

    const departmentId = generateId();
    departmentRepository.insert({
        Department_Id: departmentId,
        Department_Name: departmentName,
        Sanitized_Name: sanitizedName,
        Team_Type: resolveTeamType(org.Organization_Id, payload.teamType) ?? null,
        Creator_Agent_Id: actorAgentId,
        Is_Default: "N",
        Is_Enabled: "Y",
        Is_Visible_To_Contacts: "Y",
        Created_By: actorAgentId,
        Org_Id: org.Organization_Id
    });
    return departmentRepository.findById(departmentId);
};

const updateDepartment = (departmentId, payload, actorAgentId) => {
    getDepartmentById(departmentId);
    const org = organizationService.getDefaultOrganization();
    const departmentName = payload.departmentName.trim();
    const sanitizedName = sanitizeName(departmentName);

    const duplicate = departmentRepository.findBySanitizedName(org.Organization_Id, sanitizedName);
    if (duplicate && duplicate.Department_Id !== departmentId) {
        throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_CODES.DEPARTMENT_DUPLICATE, "A department with this name already exists");
    }

    departmentRepository.updateById(departmentId, {
        Department_Name: departmentName,
        Sanitized_Name: sanitizedName,
        ...(payload.teamType !== undefined ? { Team_Type: resolveTeamType(org.Organization_Id, payload.teamType) } : {}),
        Modified_By: actorAgentId
    });
    return departmentRepository.findById(departmentId);
};

const deleteDepartment = (departmentId, actorAgentId) => {
    const department = getDepartmentById(departmentId);
    if (department.Is_Default === "Y") {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, "The default department cannot be deleted");
    }
    departmentRepository.softDeleteById(departmentId, actorAgentId);
};

module.exports = { listDepartments, getDepartmentById, createDepartment, updateDepartment, deleteDepartment };
