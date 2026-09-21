const express = require("express");
const accountController = require("../../controllers/account.controller");

const router = express.Router();

router.get("/", accountController.listAccounts);
router.get("/:accountId", accountController.getAccountById);

module.exports = router;
