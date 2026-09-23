const express = require("express");
const agentController = require("../../controllers/agent.controller");
const validate = require("../../middleware/validate.middleware");
const { agentIdParamSchema, createAgentSchema, updateAgentSchema } = require("../../schemas/agent.schema");

const router = express.Router();

router.get("/", agentController.listAgents);
router.post("/", validate(createAgentSchema), agentController.createAgent);
router.get("/:agentId", validate(agentIdParamSchema, "params"), agentController.getAgentById);
router.patch("/:agentId", validate(agentIdParamSchema, "params"), validate(updateAgentSchema), agentController.updateAgent);
router.delete("/:agentId", validate(agentIdParamSchema, "params"), agentController.deleteAgent);

module.exports = router;
