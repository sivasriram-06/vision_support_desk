const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const env = require("./env");
const logger = require("../utils/logger");

let db = null;

const connectDB = () => {
    if (db) {
        return db;
    }

    const dbPath = path.resolve(process.cwd(), env.databasePath);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    logger.info(`SQLite connected at ${dbPath}`);
    return db;
};

const getDB = () => {
    if (!db) {
        throw new Error("Database not connected. Call connectDB() first.");
    }
    return db;
};

const closeDB = () => {
    if (db) {
        db.close();
        db = null;
    }
};

module.exports = { connectDB, getDB, closeDB };
