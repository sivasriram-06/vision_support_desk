const departmentService = require("../services/department.service");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

const listDepartments = (req, res, next) => {
    try {
        const departments = departmentService.listDepartments();
        ok(res, HTTP_STATUS.OK, departments);
    } catch (error) {
        next(error);
    }
};

const getDepartmentById = (req, res, next) => {
    try {
        const department = departmentService.getDepartmentById(req.params.departmentId);
        ok(res, HTTP_STATUS.OK, department);
    } catch (error) {
        next(error);
    }
};

module.exports = { listDepartments, getDepartmentById };
