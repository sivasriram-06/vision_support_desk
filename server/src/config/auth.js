const env = require("./env");

// JWT carries only the agent id; role and permissions are re-read on every request by auth.middleware.js.
const authConfig = {
    jwtSecret: env.jwtSecret,
    jwtExpiresIn: env.jwtExpiresIn,
    sessionCookieName: "sd_session",
    csrfHeaderName: "x-csrf-token"
};

module.exports = authConfig;
