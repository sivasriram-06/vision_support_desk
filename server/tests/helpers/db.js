require("./env");
const { connectDB, getDB } = require("../../src/config/db");
const { runMigrations } = require("../../src/database/migrate");
const { seed } = require("../../src/database/seed");

let ready = false;

// Fresh database for this test file: every migration, then the normal seed; safe to call more than once.
const setupDatabase = () => {
    if (!ready) {
        connectDB();
        runMigrations();
        seed();
        ready = true;
    }
    return getDB();
};

module.exports = { setupDatabase, getDB };
