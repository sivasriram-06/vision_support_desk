class ApiError extends Error {
    constructor(status, code, message, details = null) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;

        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = ApiError;
