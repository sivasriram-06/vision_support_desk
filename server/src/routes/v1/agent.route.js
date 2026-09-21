const express = require("express");
const agentController = require("../../controllers/agent.controller");

const router = express.Router();

router.get("/", agentController.listAgents);
router.get("/:agentId", agentController.getAgentById);

module.exports = router;
