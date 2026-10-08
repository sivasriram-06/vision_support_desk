// Must be the FIRST require in every test file; overrides server/.env so tests never touch live data.
const fs = require("fs");
const os = require("os");
const path = require("path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vsd-test-"));

Object.assign(process.env, {
    NODE_ENV: "test",
    PORT: "0",
    DATABASE_PATH: path.join(tempDir, "test.db"),
    TIMEZONE: "Asia/Kolkata",
    LOG_TO_FILE: "false",
    LOG_DIR: path.join(tempDir, "logs"),
    LOG_LEVEL: process.env.TEST_LOG_LEVEL || "error",
    ATTACHMENTS_DIR: path.join(tempDir, "attachments"),
    RECYCLE_BIN_DAYS: "30",
    JWT_SECRET: "vsd-test-secret-not-for-production",
    JWT_EXPIRES_IN: "1h",
    SYSTEM_AGENT_EMAIL: "system@vsd-test.local",
    // No seeded passwords: tests give sign-ins only to the agents they use (fixtures.js).
    SEED_DEFAULT_PASSWORD: "",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_REDIRECT_URI: "http://localhost:3456/api/v1/gmail/oauth2callback",
    GOOGLE_REFRESH_TOKEN: "",
    GMAIL_MAILBOX: "support@vsd-test.local",
    GMAIL_SYNC_ENABLED: "false",
    GMAIL_SYNC_INTERVAL_MS: "60000",
    MAX_FAILED_ATTEMPTS: "3",
    LOCK_MINUTES: "10"
});

process.on("exit", () => {
    try {
        require("../../src/config/db").closeDB();
    } catch {
        // not connected
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
});

module.exports = { tempDir };
