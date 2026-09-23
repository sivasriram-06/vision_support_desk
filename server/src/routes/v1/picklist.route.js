const express = require("express");
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
router.post("/", validate(createPicklistSchema), picklistController.createValue);
router.patch("/:picklistValueId", validate(picklistIdParamSchema, "params"), validate(updatePicklistSchema), picklistController.updateValue);
router.delete("/:picklistValueId", validate(picklistIdParamSchema, "params"), picklistController.deleteValue);

module.exports = router;
