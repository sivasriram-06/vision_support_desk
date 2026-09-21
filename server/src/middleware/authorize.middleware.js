const ApiError = require("../utils/api-error");
const HTTP_STATUS = require("../constants/http-status");
const ERROR_CODES = require("../constants/error-codes");

/**
 * NOT wired into any route yet - pairs with auth.middleware.js. Authorization
 * is meant to be derived server-side from Role -> Profile -> Department/Team
 * scope; never trust a client-supplied role.
 */
const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.agent) {
            return next(new ApiError(
                HTTP_STATUS.UNAUTHORIZED,
                ERROR_CODES.INVALID_TOKEN,
                "Authentication required"
            ));
        }

        if (allowedRoles.length > 0 && !allowedRoles.includes(req.agent.role)) {
            return next(new ApiError(
                HTTP_STATUS.FORBIDDEN,
                ERROR_CODES.FORBIDDEN,
                "You do not have permission to perform this action"
            ));
        }

        next();
    };
};

module.exports = authorize;
