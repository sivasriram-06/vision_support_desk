const departmentRepository = require("../repositories/department.repository");
const organizationService = require("./organization.service");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");

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

module.exports = { listDepartments, getDepartmentById };
