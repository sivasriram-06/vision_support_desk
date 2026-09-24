const express = require("express");
const requirePermission = require("../../middleware/authorize.middleware");
const { PERMISSIONS } = require("../../constants/permissions");
const agentController = require("../../controllers/agent.controller");
const validate = require("../../middleware/validate.middleware");
const { agentIdParamSchema, createAgentSchema, updateAgentSchema } = require("../../schemas/agent.schema");

const router = express.Router();

router.get("/", agentController.listAgents);
router.post("/", requirePermission(PERMISSIONS.AGENTS_MANAGE), validate(createAgentSchema), agentController.createAgent);
router.get("/:agentId", validate(agentIdParamSchema, "params"), agentController.getAgentById);
router.patch("/:agentId", requirePermission(PERMISSIONS.AGENTS_MANAGE), validate(agentIdParamSchema, "params"), validate(updateAgentSchema), agentController.updateAgent);
router.delete("/:agentId", requirePermission(PERMISSIONS.AGENTS_MANAGE), validate(agentIdParamSchema, "params"), agentController.deleteAgent);

module.exports = router;
