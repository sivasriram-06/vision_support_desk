const express = require("express");
const authController = require("../../controllers/auth.controller");
const authenticate = require("../../middleware/auth.middleware");
const validate = require("../../middleware/validate.middleware");
const { loginSchema, changePasswordSchema } = require("../../schemas/auth.schema");

const router = express.Router();

router.post("/login", validate(loginSchema), authController.login);
router.get("/me", authenticate, authController.me);
router.post("/change-password", authenticate, validate(changePasswordSchema), authController.changePassword);
router.post("/logout", authenticate, authController.logout);

module.exports = router;
