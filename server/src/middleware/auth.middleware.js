const jwt = require("jsonwebtoken");
const authConfig = require("../config/auth");
const authService = require("../services/auth.service");
const ApiError = require("../utils/api-error");
const HTTP_STATUS = require("../constants/http-status");
const ERROR_CODES = require("../constants/error-codes");

// Routes a user with a temporary (admin-issued / seeded) password may still
// call - everything else is refused until they choose their own password.
const PASSWORD_CHANGE_ALLOWED = ["/auth/me", "/auth/change-password", "/auth/logout"];

const readToken = (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        if (!authHeader.startsWith("Bearer ")) {
            throw new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.INVALID_CREDENTIALS, "Invalid authentication scheme");
        }
        return authHeader.slice("Bearer ".length).trim();
    }
    // The httpOnly cookie is accepted for safe (read-only) requests only -
    // it exists so plain <a href> attachment downloads carry auth. Writes
    // must present the Bearer header, which a cross-site form can't forge.
    if ((req.method === "GET" || req.method === "HEAD") && req.cookies && req.cookies[authConfig.sessionCookieName]) {
        return req.cookies[authConfig.sessionCookieName];
    }
    return null;
};

/**
 * Verifies the JWT, then loads the agent's current role/permissions from
 * the database into req.agent (see auth.service.buildPrincipal). The JWT
 * only carries the agent id - never trust a client-held role.
 */
const authenticate = (req, res, next) => {
    try {
        const token = readToken(req);
        if (!token) {
            throw new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.INVALID_TOKEN, "Authentication required");
        }

        const decoded = jwt.verify(token, authConfig.jwtSecret);
        const principal = authService.buildPrincipal(decoded.sub);
        if (!principal || !principal.hasCredential) {
            throw new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.INVALID_TOKEN, "Session is no longer valid. Please sign in again.");
        }
        if (principal.status !== "Active") {
            throw new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.ACCOUNT_INACTIVE, "This account is inactive. Contact your administrator.");
        }

        const path = req.originalUrl.split("?")[0].replace(/^\/api\/v1/, "");
        if (principal.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.includes(path)) {
            throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.PASSWORD_CHANGE_REQUIRED, "Please change your temporary password to continue");
        }

        req.agent = principal;
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = authenticate;
