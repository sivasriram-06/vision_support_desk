const express = require("express");
const authenticate = require("../../middleware/auth.middleware");

const ticketRoutes = require("./ticket.route");
const contactRoutes = require("./contact.route");
const accountRoutes = require("./account.route");
const agentRoutes = require("./agent.route");
const departmentRoutes = require("./department.route");
const bankRoutes = require("./bank.route");
const picklistRoutes = require("./picklist.route");
const productRoutes = require("./product.route");
const prioritySlaRoutes = require("./priority-sla.route");
const gmailRoutes = require("./gmail.route");
const authRoutes = require("./auth.route");
const adminRoutes = require("./admin.route");

const router = express.Router();

// Public: sign-in and gmail
router.use("/auth", authRoutes);
router.use("/gmail", gmailRoutes);

// Everything below requires a signed-in agent.
router.use(authenticate);

router.use("/tickets", ticketRoutes);
router.use("/contacts", contactRoutes);
router.use("/accounts", accountRoutes);
router.use("/agents", agentRoutes);
router.use("/departments", departmentRoutes);
router.use("/banks", bankRoutes);
router.use("/picklists", picklistRoutes);
router.use("/products", productRoutes);
router.use("/priority-sla", prioritySlaRoutes);
router.use("/admin", adminRoutes);

module.exports = router;
