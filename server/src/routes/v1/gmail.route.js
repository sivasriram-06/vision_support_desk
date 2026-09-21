const express = require("express");
const gmailController = require("../../controllers/gmail.controller");

const router = express.Router();

router.get("/auth-url", gmailController.getAuthUrl);
router.get("/oauth2callback", gmailController.oauthCallback);
router.post("/sync", gmailController.sync);

module.exports = router;
