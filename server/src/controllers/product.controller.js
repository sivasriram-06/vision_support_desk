const productService = require("../services/product.service");
const getActorAgentId = require("../utils/get-actor");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

const listProducts = (req, res, next) => {
    try {
        const products = productService.listProducts();
        ok(res, HTTP_STATUS.OK, products);
    } catch (error) {
        next(error);
    }
};

const getProductById = (req, res, next) => {
    try {
        const product = productService.getProductById(req.params.productId);
        ok(res, HTTP_STATUS.OK, product);
    } catch (error) {
        next(error);
    }
};

const createProduct = (req, res, next) => {
    try {
        const product = productService.createProduct(req.body, getActorAgentId(req));
        ok(res, HTTP_STATUS.CREATED, product);
    } catch (error) {
        next(error);
    }
};

const updateProduct = (req, res, next) => {
    try {
        const product = productService.updateProduct(req.params.productId, req.body, getActorAgentId(req));
        ok(res, HTTP_STATUS.OK, product);
    } catch (error) {
        next(error);
    }
};

const deleteProduct = (req, res, next) => {
    try {
        productService.deleteProduct(req.params.productId, getActorAgentId(req));
        ok(res, HTTP_STATUS.OK, { deleted: true });
    } catch (error) {
        next(error);
    }
};

module.exports = { listProducts, getProductById, createProduct, updateProduct, deleteProduct };
