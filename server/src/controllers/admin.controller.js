const adminService = require("../services/admin.service");
const permissionService = require("../services/permission.service");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

const handle = (fn, status = HTTP_STATUS.OK) => (req, res, next) => {
    try {
        ok(res, status, fn(req));
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getPermissionCatalog: handle(() => permissionService.getPermissionCatalog()),
    listRoles: handle(() => permissionService.listRoles()),
    updateRolePermissions: handle((req) => permissionService.updateRolePermissions(req.params.roleId, req.body.permissions, req.agent.agentId)),
    listUsers: handle(() => adminService.listUsers()),
    setTemporaryPassword: handle((req) => adminService.setTemporaryPassword(req.params.agentId, req.body.password, req.agent)),
    revokeLogin: handle((req) => adminService.revokeLogin(req.params.agentId, req.agent)),
    listLoginEvents: handle(() => adminService.listLoginEvents()),
    getMailIntegration: handle(() => adminService.getMailIntegration())
};
