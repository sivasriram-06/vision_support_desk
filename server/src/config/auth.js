const env = require("./env");

/**
 * Placeholder for future JWT-based, role/profile-scoped authorization
 * (HD_AGENT_AUTH / HD_AGENT_SESSION / HD_ROLE_MASTER / HD_PROFILE_MASTER).
 * Not wired into any route yet - middleware/auth.middleware.js and
 * middleware/authorize.middleware.js are ready to use this once the
 * /api/v1/auth/* login flow is implemented.
 */
const authConfig = {
    jwtSecret: env.jwtSecret,
    jwtExpiresIn: env.jwtExpiresIn,
    sessionCookieName: "sd_session",
    csrfHeaderName: "x-csrf-token"
};

module.exports = authConfig;
