const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");

const notFoundMiddleware = (req, res, next) => {
    next(new ApiError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.ROUTE_NOT_FOUND,
        `Route ${req.method} ${req.originalUrl} not found`
    ));
};

module.exports = notFoundMiddleware;
