const express = require("express");
const departmentController = require("../../controllers/department.controller");

const router = express.Router();

router.get("/", departmentController.listDepartments);
router.get("/:departmentId", departmentController.getDepartmentById);

module.exports = router;
