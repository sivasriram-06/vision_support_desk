const express = require("express");
const requirePermission = require("../../middleware/authorize.middleware");
const { PERMISSIONS } = require("../../constants/permissions");
const picklistController = require("../../controllers/picklist.controller");
const validate = require("../../middleware/validate.middleware");
const {
    picklistIdParamSchema,
    listPicklistQuerySchema,
    createPicklistSchema,
    updatePicklistSchema
} = require("../../schemas/picklist.schema");

const router = express.Router();

router.get("/", validate(listPicklistQuerySchema, "query"), picklistController.listValues);
router.post("/", requirePermission(PERMISSIONS.CONFIG_MANAGE), validate(createPicklistSchema), picklistController.createValue);
router.patch("/:picklistValueId", requirePermission(PERMISSIONS.CONFIG_MANAGE), validate(picklistIdParamSchema, "params"), validate(updatePicklistSchema), picklistController.updateValue);
router.delete("/:picklistValueId", requirePermission(PERMISSIONS.CONFIG_MANAGE), validate(picklistIdParamSchema, "params"), picklistController.deleteValue);

module.exports = router;
