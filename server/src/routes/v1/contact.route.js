const express = require("express");
const requirePermission = require("../../middleware/authorize.middleware");
const { PERMISSIONS } = require("../../constants/permissions");
const contactController = require("../../controllers/contact.controller");
const validate = require("../../middleware/validate.middleware");
const { createContactSchema, listContactsQuerySchema } = require("../../schemas/contact.schema");

const router = express.Router();

router.get("/", validate(listContactsQuerySchema, "query"), contactController.listContacts);
router.post("/", requirePermission(PERMISSIONS.TICKETS_CREATE), validate(createContactSchema), contactController.createContact);
router.get("/:contactId", contactController.getContactById);

module.exports = router;
