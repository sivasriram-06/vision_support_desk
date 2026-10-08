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
    // IANA zone for logs and the seed's default bank zone; stored timestamps are always IST +05:30 regardless.
    timezone: requireEnv("TIMEZONE"),

    logging: {
        toFile: requireEnvBool("LOG_TO_FILE"),
        dir: requireEnv("LOG_DIR")
    },

    // Attachment files root on disk; HD_TICKET_ATTACHMENT.Storage_Path is relative to it.
    attachmentsDir: requireEnv("ATTACHMENTS_DIR"),

    // Days a deleted ticket stays restorable in the recycle bin before it is permanently purged.
    recycleBinDays: requireEnvInt("RECYCLE_BIN_DAYS"),

    jwtSecret: requireEnv("JWT_SECRET"),
    jwtExpiresIn: requireEnv("JWT_EXPIRES_IN"),

    // Hidden system actor (seeded) that owns rows Gmail ingestion creates; never shown on screen.
    systemAgentEmail: requireEnv("SYSTEM_AGENT_EMAIL").toLowerCase(),

    // Optional seed-only temp password for agents without a sign-in; unset means admins set passwords instead.
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
