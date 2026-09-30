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
    // as the default bank time zone at seed time. Stored timestamps are always
    // IST ISO with the +05:30 offset (utils/time.js), whatever this is set to.
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
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN ? process.env.GOOGLE_REFRESH_TOKEN : null,
        mailbox: requireEnv("GMAIL_MAILBOX"),
        syncEnabled: requireEnvBool("GMAIL_SYNC_ENABLED"),
        syncIntervalMs: requireEnvInt("GMAIL_SYNC_INTERVAL_MS")
    },

    passwordPolicy:{
        maxFailedAttempts: requireEnvInt("MAX_FAILED_ATTEMPTS"),
        lockMinutes: requireEnvInt("LOCK_MINUTES")
    }
};

module.exports = env;
