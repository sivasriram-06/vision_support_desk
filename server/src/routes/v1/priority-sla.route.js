const express = require("express");
const requirePermission = require("../../middleware/authorize.middleware");
const { PERMISSIONS } = require("../../constants/permissions");
const prioritySlaController = require("../../controllers/priority-sla.controller");
const validate = require("../../middleware/validate.middleware");
const { priorityParamSchema, createPrioritySlaSchema, upsertPrioritySlaSchema } = require("../../schemas/priority-sla.schema");

const router = express.Router();

router.get("/", prioritySlaController.listConfig);
router.post("/", requirePermission(PERMISSIONS.CONFIG_MANAGE), validate(createPrioritySlaSchema), prioritySlaController.createConfig);
router.put("/:priority", requirePermission(PERMISSIONS.CONFIG_MANAGE), validate(priorityParamSchema, "params"), validate(upsertPrioritySlaSchema), prioritySlaController.upsertConfig);
router.delete("/:priority", requirePermission(PERMISSIONS.CONFIG_MANAGE), validate(priorityParamSchema, "params"), prioritySlaController.deleteConfig);

module.exports = router;
