const productRepository = require("../repositories/product.repository");
const organizationService = require("./organization.service");
const generateId = require("../utils/generate-id");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");

const listProducts = () => {
    const org = organizationService.getDefaultOrganization();
    return productRepository.findAll(org.Organization_Id);
};

const getProductById = (productId) => {
    const product = productRepository.findById(productId);
    if (!product) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.PRODUCT_NOT_FOUND, "Product not found");
    }
    return product;
};

const createProduct = (payload, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const productName = payload.productName.trim();

    const existing = productRepository.findByName(org.Organization_Id, productName);
    if (existing) {
        throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_CODES.PRODUCT_DUPLICATE, "A product with this name already exists");
    }

    const productId = generateId();
    productRepository.insert({
        Product_Id: productId,
        Product_Name: productName,
        Description: payload.description || null,
        Department_Id: payload.departmentId || null,
        Created_By: actorAgentId,
        Org_Id: org.Organization_Id
    });
    return productRepository.findById(productId);
};

const updateProduct = (productId, payload, actorAgentId) => {
    const existing = getProductById(productId);
    const org = organizationService.getDefaultOrganization();

    const changes = { Modified_By: actorAgentId };
    if (payload.productName !== undefined) {
        const productName = payload.productName.trim();
        const duplicate = productRepository.findByName(org.Organization_Id, productName);
        if (duplicate && duplicate.Product_Id !== productId) {
            throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_CODES.PRODUCT_DUPLICATE, "A product with this name already exists");
        }
        changes.Product_Name = productName;
    }
    if (payload.description !== undefined) {
        changes.Description = payload.description;
    }
    if (payload.departmentId !== undefined) {
        changes.Department_Id = payload.departmentId;
    }

    productRepository.updateById(productId, changes);
    return productRepository.findById(productId);
};

const deleteProduct = (productId, actorAgentId) => {
    getProductById(productId);
    productRepository.softDeleteById(productId, actorAgentId);
};

module.exports = { listProducts, getProductById, createProduct, updateProduct, deleteProduct };
