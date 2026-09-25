const express = require("express");
const requirePermission = require("../../middleware/authorize.middleware");
const { PERMISSIONS } = require("../../constants/permissions");
const escalationLevelController = require("../../controllers/escalation-level.controller");
const validate = require("../../middleware/validate.middleware");
const {
    escalationLevelIdParamSchema,
    createEscalationLevelSchema,
    updateEscalationLevelSchema
} = require("../../schemas/escalation-level.schema");

const router = express.Router();

router.get("/", escalationLevelController.listLevels);
router.post("/", requirePermission(PERMISSIONS.CONFIG_MANAGE), validate(createEscalationLevelSchema), escalationLevelController.createLevel);
router.patch("/:escalationLevelId", requirePermission(PERMISSIONS.CONFIG_MANAGE), validate(escalationLevelIdParamSchema, "params"), validate(updateEscalationLevelSchema), escalationLevelController.updateLevel);
router.delete("/:escalationLevelId", requirePermission(PERMISSIONS.CONFIG_MANAGE), validate(escalationLevelIdParamSchema, "params"), escalationLevelController.deleteLevel);

module.exports = router;
