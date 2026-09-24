const express = require("express");
const requirePermission = require("../../middleware/authorize.middleware");
const { PERMISSIONS } = require("../../constants/permissions");
const productController = require("../../controllers/product.controller");
const validate = require("../../middleware/validate.middleware");
const { productIdParamSchema, createProductSchema, updateProductSchema } = require("../../schemas/product.schema");

const router = express.Router();

router.get("/", productController.listProducts);
router.post("/", requirePermission(PERMISSIONS.CONFIG_MANAGE), validate(createProductSchema), productController.createProduct);
router.get("/:productId", validate(productIdParamSchema, "params"), productController.getProductById);
router.patch("/:productId", requirePermission(PERMISSIONS.CONFIG_MANAGE), validate(productIdParamSchema, "params"), validate(updateProductSchema), productController.updateProduct);
router.delete("/:productId", requirePermission(PERMISSIONS.CONFIG_MANAGE), validate(productIdParamSchema, "params"), productController.deleteProduct);

module.exports = router;
