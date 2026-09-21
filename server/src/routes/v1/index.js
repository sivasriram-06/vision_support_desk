const express = require("express");

const ticketRoutes = require("./ticket.route");
const contactRoutes = require("./contact.route");
const accountRoutes = require("./account.route");
const agentRoutes = require("./agent.route");
const departmentRoutes = require("./department.route");
const teamRoutes = require("./team.route");
const gmailRoutes = require("./gmail.route");

const router = express.Router();

router.use("/tickets", ticketRoutes);
router.use("/contacts", contactRoutes);
router.use("/accounts", accountRoutes);
router.use("/agents", agentRoutes);
router.use("/departments", departmentRoutes);
router.use("/teams", teamRoutes);
router.use("/gmail", gmailRoutes);

module.exports = router;
