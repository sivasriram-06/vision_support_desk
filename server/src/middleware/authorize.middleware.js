const ApiError = require("../utils/api-error");
const HTTP_STATUS = require("../constants/http-status");
const ERROR_CODES = require("../constants/error-codes");

// Passes if req.agent holds at least ONE of the given permission keys (resolved from the role per request).
const requirePermission = (...permissions) => {
    return (req, res, next) => {
        if (!req.agent) {
            return next(new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.INVALID_TOKEN, "Authentication required"));
        }

        if (permissions.length > 0 && !permissions.some((key) => req.agent.permissions.includes(key))) {
            return next(new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, "You do not have permission to perform this action"));
        }

        next();
    };
};

module.exports = requirePermission;
