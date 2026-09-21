const fs = require("fs");
const path = require("path");
const env = require("../config/env");

const LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

const currentLevel = LEVELS[process.env.LOG_LEVEL] !== undefined
    ? LEVELS[process.env.LOG_LEVEL]
    : LEVELS.info;

const timestampFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: env.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
});

/** { date: "2026-09-21", time: "18:46:38" } in the configured TIMEZONE. */
const nowParts = () => {
    const parts = timestampFormatter.formatToParts(new Date())
        .reduce((acc, part) => { acc[part.type] = part.value; return acc; }, {});
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
};

const logDir = path.resolve(process.cwd(), env.logging.dir);
if (env.logging.toFile) {
    fs.mkdirSync(logDir, { recursive: true });
}

/** Serializes Error objects (with stack) and other args for a log file line. */
const formatArgsForFile = (args) => args.map((arg) => {
    if (arg instanceof Error) {
        return arg.stack || arg.message;
    }
    if (typeof arg === "object" && arg !== null) {
        try {
            return JSON.stringify(arg);
        } catch {
            return String(arg);
        }
    }
    return String(arg);
}).join(" ");

/**
 * Appends one line to logs/<date>.log (every level) and, for errors, also
 * to logs/error-<date>.log - so an ops person can `tail` just the errors.
 * One file per calendar day (in TIMEZONE) doubles as simple log rotation.
 */
const writeToFile = (level, date, line) => {
    if (!env.logging.toFile) {
        return;
    }
    try {
        fs.appendFileSync(path.join(logDir, `${date}.log`), `${line}\n`);
        if (level === "error") {
            fs.appendFileSync(path.join(logDir, `error-${date}.log`), `${line}\n`);
        }
    } catch (fileError) {
        console.error("Failed to write log file:", fileError.message);
    }
};

const log = (level, ...args) => {
    if (LEVELS[level] > currentLevel) {
        return;
    }

    const { date, time } = nowParts();
    const prefix = `[${date} ${time} (${env.timezone})] [${level.toUpperCase()}]`;
    const line = `${prefix} ${formatArgsForFile(args)}`;

    const method = level === "error" ? console.error
        : level === "warn" ? console.warn
            : console.log;
    method(prefix, ...args);

    writeToFile(level, date, line);
};

const logger = {
    error: (...args) => log("error", ...args),
    warn: (...args) => log("warn", ...args),
    info: (...args) => log("info", ...args),
    debug: (...args) => log("debug", ...args),
    /** For morgan: `app.use(morgan(fmt, { stream: logger.httpStream }))`. */
    httpStream: {
        write: (message) => {
            const trimmed = message.trimEnd();
            const { date, time } = nowParts();
            console.log(`[${date} ${time} (${env.timezone})] [HTTP] ${trimmed}`);
            writeToFile("info", date, `[${date} ${time} (${env.timezone})] [HTTP] ${trimmed}`);
        }
    }
};

module.exports = logger;
