const crypto = require("crypto");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");
const logger = require("../utils/logger");

const errorMiddleware = (err, req, res, next) => { // eslint-disable-line no-unused-vars
    const traceId = req.traceId || crypto.randomUUID();

    // better-sqlite3 constraint violations
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE" || err.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
        return res.status(HTTP_STATUS.CONFLICT).json({
            error: {
                code: ERROR_CODES.DUPLICATE_KEY,
                message: "A record with this value already exists",
                traceId
            }
        });
    }

    if (err.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            error: {
                code: ERROR_CODES.FOREIGN_KEY_VIOLATION,
                message: "Referenced record does not exist",
                traceId
            }
        });
    }

    if (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError") {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
            error: {
                code: ERROR_CODES.INVALID_TOKEN,
                message: "Invalid or expired access token",
                traceId
            }
        });
    }

    const status = err.status || HTTP_STATUS.INTERNAL_SERVER_ERROR;

    if (status >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
        logger.error(`[${traceId}]`, err);
    }

    res.status(status).json({
        error: {
            code: err.code || ERROR_CODES.INTERNAL_ERROR,
            message: err.message || "Something went wrong",
            ...(err.details ? { details: err.details } : {}),
            traceId
        }
    });
};

module.exports = errorMiddleware;
