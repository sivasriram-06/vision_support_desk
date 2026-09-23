const express = require("express");
const departmentController = require("../../controllers/department.controller");
const validate = require("../../middleware/validate.middleware");
const { departmentIdParamSchema, createDepartmentSchema, updateDepartmentSchema } = require("../../schemas/department.schema");

const router = express.Router();

router.get("/", departmentController.listDepartments);
router.post("/", validate(createDepartmentSchema), departmentController.createDepartment);
router.get("/:departmentId", validate(departmentIdParamSchema, "params"), departmentController.getDepartmentById);
router.patch("/:departmentId", validate(departmentIdParamSchema, "params"), validate(updateDepartmentSchema), departmentController.updateDepartment);
router.delete("/:departmentId", validate(departmentIdParamSchema, "params"), departmentController.deleteDepartment);

module.exports = router;
