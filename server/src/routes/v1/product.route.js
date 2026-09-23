const express = require("express");
const productController = require("../../controllers/product.controller");
const validate = require("../../middleware/validate.middleware");
const { productIdParamSchema, createProductSchema, updateProductSchema } = require("../../schemas/product.schema");

const router = express.Router();

router.get("/", productController.listProducts);
router.post("/", validate(createProductSchema), productController.createProduct);
router.get("/:productId", validate(productIdParamSchema, "params"), productController.getProductById);
router.patch("/:productId", validate(productIdParamSchema, "params"), validate(updateProductSchema), productController.updateProduct);
router.delete("/:productId", validate(productIdParamSchema, "params"), productController.deleteProduct);

module.exports = router;
