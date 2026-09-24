require("dotenv").config();

const requireEnv = (name) => {
    const value = process.env[name];
    if (value === undefined || value === "") {
        throw new Error(`${name} not found in env`);
    }
    return value;
};

const requireEnvBool = (name) => {
    const value = requireEnv(name);
    if (value !== "true" && value !== "false") {
        throw new Error(`${name} must be "true" or "false" in env`);
    }
    return value === "true";
};

const requireEnvInt = (name) => {
    const value = requireEnv(name);
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${name} must be a positive integer in env`);
    }
    return parsed;
};

const env = {
    nodeEnv: requireEnv("NODE_ENV"),
    port: Number(requireEnv("PORT")),
    databasePath: requireEnv("DATABASE_PATH"),
    // IANA zone name, e.g. "Asia/Kolkata" (IST). Used for log timestamps and
    // as the default HD_ORGANIZATION_MASTER.Time_Zone at seed time. Database
    // timestamps themselves stay UTC (SQLite datetime('now')) - converting
    // storage to local time is a well-known source of DST/ambiguity bugs;
    // this only affects display.
    timezone: requireEnv("TIMEZONE"),

    logging: {
        toFile: requireEnvBool("LOG_TO_FILE"),
        dir: requireEnv("LOG_DIR")
    },

    // Where attachment bytes (from Gmail ingestion, and future direct
    // uploads) are stored on disk. HD_TICKET_ATTACHMENT.Storage_Path is
    // relative to this root.
    attachmentsDir: requireEnv("ATTACHMENTS_DIR"),

    jwtSecret: requireEnv("JWT_SECRET"),
    jwtExpiresIn: requireEnv("JWT_EXPIRES_IN"),

    // Seed-only and optional: the temporary password `npm run seed` gives
    // each seeded agent that has no sign-in yet (they must change it on
    // first login). Left unset, the seed issues no credentials and an admin
    // sets passwords from the Admin page instead.
    seedDefaultPassword: process.env.SEED_DEFAULT_PASSWORD ? process.env.SEED_DEFAULT_PASSWORD : null,

    google: {
        clientId: requireEnv("GOOGLE_CLIENT_ID"),
        clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
        redirectUri: requireEnv("GOOGLE_REDIRECT_URI"),
        // Exception to "throw if missing": this is genuinely empty on a
        // fresh setup - it only exists AFTER the one-time consent flow at
        // GET /api/v1/gmail/auth-url completes (docs/development/gmail-console-setup.md
        // step 5). The server must be able to boot without it so that flow
        // can run at all. gmail.client.js throws GMAIL_NOT_CONFIGURED at
        // call time if a Gmail API call is attempted before it's set.
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN ? process.env.GOOGLE_REFRESH_TOKEN : null,
        // The mailbox ingestion targets. Currently sivasriram.balasubramaniyan@sunoida.com
        // for testing; will change once the real tasks@sunoida.com OAuth grant is set up.
        mailbox: requireEnv("GMAIL_MAILBOX"),

        // Background sync job (src/jobs/gmail-sync.job.js). Independent of
        // refreshToken above: the job simply doesn't start yet if that's
        // still null, logging why instead of throwing.
        syncEnabled: requireEnvBool("GMAIL_SYNC_ENABLED"),
        syncIntervalMs: requireEnvInt("GMAIL_SYNC_INTERVAL_MS")
    }
};

module.exports = env;
