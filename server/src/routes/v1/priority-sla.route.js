const express = require("express");
const prioritySlaController = require("../../controllers/priority-sla.controller");
const validate = require("../../middleware/validate.middleware");
const { priorityParamSchema, createPrioritySlaSchema, upsertPrioritySlaSchema } = require("../../schemas/priority-sla.schema");

const router = express.Router();

router.get("/", prioritySlaController.listConfig);
router.post("/", validate(createPrioritySlaSchema), prioritySlaController.createConfig);
router.put("/:priority", validate(priorityParamSchema, "params"), validate(upsertPrioritySlaSchema), prioritySlaController.upsertConfig);
router.delete("/:priority", validate(priorityParamSchema, "params"), prioritySlaController.deleteConfig);

module.exports = router;
