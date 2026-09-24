const env = require("./env");

/**
 * Agent sign-in: email + password (HD_AGENT_CREDENTIAL) issues a JWT that
 * only carries the agent id; role and permissions (HD_ROLE_MASTER) are
 * re-read on every request by middleware/auth.middleware.js.
 */
const authConfig = {
    jwtSecret: env.jwtSecret,
    jwtExpiresIn: env.jwtExpiresIn,
    sessionCookieName: "sd_session",
    csrfHeaderName: "x-csrf-token"
};

module.exports = authConfig;
