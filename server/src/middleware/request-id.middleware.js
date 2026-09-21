const crypto = require("crypto");

const requestIdMiddleware = (req, res, next) => {
    req.traceId = crypto.randomUUID();
    res.setHeader("X-Trace-Id", req.traceId);
    next();
};

module.exports = requestIdMiddleware;
