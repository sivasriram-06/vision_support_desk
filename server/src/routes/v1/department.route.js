const express = require("express");
const requirePermission = require("../../middleware/authorize.middleware");
const { PERMISSIONS } = require("../../constants/permissions");
const departmentController = require("../../controllers/department.controller");
const validate = require("../../middleware/validate.middleware");
const { departmentIdParamSchema, createDepartmentSchema, updateDepartmentSchema } = require("../../schemas/department.schema");

const router = express.Router();

router.get("/", departmentController.listDepartments);
router.post("/", requirePermission(PERMISSIONS.TEAMS_MANAGE), validate(createDepartmentSchema), departmentController.createDepartment);
router.get("/:departmentId", validate(departmentIdParamSchema, "params"), departmentController.getDepartmentById);
router.patch("/:departmentId", requirePermission(PERMISSIONS.TEAMS_MANAGE), validate(departmentIdParamSchema, "params"), validate(updateDepartmentSchema), departmentController.updateDepartment);
router.delete("/:departmentId", requirePermission(PERMISSIONS.TEAMS_MANAGE), validate(departmentIdParamSchema, "params"), departmentController.deleteDepartment);

module.exports = router;
