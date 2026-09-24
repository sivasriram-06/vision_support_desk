const express = require("express");
const requirePermission = require("../../middleware/authorize.middleware");
const { PERMISSIONS } = require("../../constants/permissions");
const bankController = require("../../controllers/bank.controller");
const validate = require("../../middleware/validate.middleware");
const { bankIdParamSchema, createBankSchema, updateBankSchema } = require("../../schemas/bank.schema");

const router = express.Router();

router.get("/", bankController.listBanks);
router.post("/", requirePermission(PERMISSIONS.TEAMS_MANAGE), validate(createBankSchema), bankController.createBank);
router.get("/:bankId", validate(bankIdParamSchema, "params"), bankController.getBankById);
router.patch("/:bankId", requirePermission(PERMISSIONS.TEAMS_MANAGE), validate(bankIdParamSchema, "params"), validate(updateBankSchema), bankController.updateBank);
router.delete("/:bankId", requirePermission(PERMISSIONS.TEAMS_MANAGE), validate(bankIdParamSchema, "params"), bankController.deleteBank);

module.exports = router;
