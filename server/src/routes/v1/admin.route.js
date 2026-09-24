const express = require("express");
const adminController = require("../../controllers/admin.controller");
const validate = require("../../middleware/validate.middleware");
const requirePermission = require("../../middleware/authorize.middleware");
const { PERMISSIONS } = require("../../constants/permissions");
const {
    roleIdParamSchema,
    agentIdParamSchema,
    updateRolePermissionsSchema,
    setPasswordSchema
} = require("../../schemas/admin.schema");

const router = express.Router();

// Roles are also readable by agent managers - the Agents page needs the
// list to offer a role dropdown. Everything else is the Admin page only.
router.get("/roles", requirePermission(PERMISSIONS.ADMIN_ACCESS, PERMISSIONS.AGENTS_MANAGE), adminController.listRoles);

router.use(requirePermission(PERMISSIONS.ADMIN_ACCESS));

router.get("/permissions", adminController.getPermissionCatalog);
router.put("/roles/:roleId/permissions", validate(roleIdParamSchema, "params"), validate(updateRolePermissionsSchema), adminController.updateRolePermissions);
router.get("/users", adminController.listUsers);
router.put("/users/:agentId/password", validate(agentIdParamSchema, "params"), validate(setPasswordSchema), adminController.setTemporaryPassword);
router.delete("/users/:agentId/password", validate(agentIdParamSchema, "params"), adminController.revokeLogin);
router.get("/login-events", adminController.listLoginEvents);
router.get("/mail-integration", adminController.getMailIntegration);

module.exports = router;
