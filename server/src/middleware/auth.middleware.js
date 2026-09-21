const jwt = require("jsonwebtoken");
const authConfig = require("../config/auth");
const ApiError = require("../utils/api-error");
const HTTP_STATUS = require("../constants/http-status");
const ERROR_CODES = require("../constants/error-codes");

/**
 * NOT wired into any route yet - the Login & Security module
 * (/api/v1/auth/*) has not been implemented. Ready for when it is:
 * expects a Bearer JWT whose payload carries { sub: Agent_Id, role,
 * profileId, departmentIds }, per docs/Zoho_Desk_UI_Module_API_Reference.docx
 * module 01.
 */
const authenticate = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            throw new ApiError(
                HTTP_STATUS.UNAUTHORIZED,
                ERROR_CODES.INVALID_TOKEN,
                "Authentication required"
            );
        }

        if (!authHeader.startsWith("Bearer ")) {
            throw new ApiError(
                HTTP_STATUS.UNAUTHORIZED,
                ERROR_CODES.INVALID_CREDENTIALS,
                "Invalid authentication scheme"
            );
        }

        const token = authHeader.split(" ")[1];
        if (!token) {
            throw new ApiError(
                HTTP_STATUS.UNAUTHORIZED,
                ERROR_CODES.INVALID_CREDENTIALS,
                "Authentication token missing"
            );
        }

        const decoded = jwt.verify(token, authConfig.jwtSecret);
        req.agent = {
            agentId: decoded.sub,
            role: decoded.role,
            profileId: decoded.profileId,
            departmentIds: decoded.departmentIds || []
        };

        next();
    } catch (error) {
        next(error);
    }
};

module.exports = authenticate;
