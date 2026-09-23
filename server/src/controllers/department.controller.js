const departmentService = require("../services/department.service");
const getActorAgentId = require("../utils/get-actor");
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

const createDepartment = (req, res, next) => {
    try {
        const department = departmentService.createDepartment(req.body, getActorAgentId(req));
        ok(res, HTTP_STATUS.CREATED, department);
    } catch (error) {
        next(error);
    }
};

const updateDepartment = (req, res, next) => {
    try {
        const department = departmentService.updateDepartment(req.params.departmentId, req.body, getActorAgentId(req));
        ok(res, HTTP_STATUS.OK, department);
    } catch (error) {
        next(error);
    }
};

const deleteDepartment = (req, res, next) => {
    try {
        departmentService.deleteDepartment(req.params.departmentId, getActorAgentId(req));
        ok(res, HTTP_STATUS.OK, { deleted: true });
    } catch (error) {
        next(error);
    }
};

module.exports = { listDepartments, getDepartmentById, createDepartment, updateDepartment, deleteDepartment };
