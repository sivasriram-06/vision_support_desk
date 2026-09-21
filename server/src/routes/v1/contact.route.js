const express = require("express");
const contactController = require("../../controllers/contact.controller");
const validate = require("../../middleware/validate.middleware");
const { createContactSchema, listContactsQuerySchema } = require("../../schemas/contact.schema");

const router = express.Router();

router.get("/", validate(listContactsQuerySchema, "query"), contactController.listContacts);
router.post("/", validate(createContactSchema), contactController.createContact);
router.get("/:contactId", contactController.getContactById);

module.exports = router;
