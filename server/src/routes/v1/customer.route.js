const express = require("express");
const requirePermission = require("../../middleware/authorize.middleware");
const { PERMISSIONS } = require("../../constants/permissions");
const customerController = require("../../controllers/customer.controller");
const validate = require("../../middleware/validate.middleware");
const { customerIdParamSchema, listCustomersQuerySchema, updateCustomerSchema } = require("../../schemas/customer.schema");

// Customers page (customers.manage); /contacts stays as-is for the ticket screens every agent uses.
const router = express.Router();
router.use(requirePermission(PERMISSIONS.CUSTOMERS_MANAGE));

router.get("/", validate(listCustomersQuerySchema, "query"), customerController.listCustomers);
router.get("/:contactId", validate(customerIdParamSchema, "params"), customerController.getCustomer);
router.patch("/:contactId", validate(customerIdParamSchema, "params"), validate(updateCustomerSchema), customerController.updateCustomer);

module.exports = router;
