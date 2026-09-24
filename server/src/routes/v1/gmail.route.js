const express = require("express");
const requirePermission = require("../../middleware/authorize.middleware");
const { PERMISSIONS } = require("../../constants/permissions");
const gmailController = require("../../controllers/gmail.controller");
const authenticate = require("../../middleware/auth.middleware");

const router = express.Router();

const adminOnly = [authenticate, requirePermission(PERMISSIONS.ADMIN_ACCESS)];

router.get("/auth-url", adminOnly, gmailController.getAuthUrl);
router.get("/oauth2callback", gmailController.oauthCallback);
router.post("/sync", adminOnly, gmailController.sync);
router.post("/sync-deletions", adminOnly, gmailController.syncDeletions);

module.exports = router;
