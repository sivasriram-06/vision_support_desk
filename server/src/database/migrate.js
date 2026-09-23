const fs = require("fs");
const path = require("path");
const { connectDB, closeDB } = require("../config/db");
const logger = require("../utils/logger");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

const ensureMigrationsTable = (db) => {
    db.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
};

const getAppliedMigrations = (db) => {
    const rows = db.prepare("SELECT name FROM _migrations").all();
    return new Set(rows.map((row) => row.name));
};

const runMigrations = () => {
    const db = connectDB();
    ensureMigrationsTable(db);

    const applied = getAppliedMigrations(db);
    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter((file) => file.endsWith(".sql"))
        .sort();

    let appliedCount = 0;

    for (const file of files) {
        if (applied.has(file)) {
            continue;
        }

        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

        // SQLite only honors PRAGMA foreign_keys when toggled outside any
        // transaction (it's a silent no-op mid-transaction) - migrations
        // that rebuild a table referenced by FKs (drop+recreate to change a
        // CHECK constraint, since SQLite has no ALTER TABLE ... DROP
        // CONSTRAINT) mark themselves with a leading "-- fk:off" comment and
        // manage their own BEGIN/COMMIT so we can disable FK enforcement
        // around them instead of using the db.transaction() wrapper below.
        if (sql.trimStart().startsWith("-- fk:off")) {
            db.pragma("foreign_keys = OFF");
            try {
                db.exec(sql);
                db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
            } catch (error) {
                try {
                    db.exec("ROLLBACK");
                } catch (_) {
                    // no transaction was open - nothing to roll back
                }
                throw error;
            } finally {
                db.pragma("foreign_keys = ON");
            }
            logger.info(`Applied migration: ${file}`);
            appliedCount += 1;
            continue;
        }

        const applyMigration = db.transaction(() => {
            db.exec(sql);
            db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
        });

        applyMigration();
        logger.info(`Applied migration: ${file}`);
        appliedCount += 1;
    }

    if (appliedCount === 0) {
        logger.info("No pending migrations. Database is up to date.");
    } else {
        logger.info(`Applied ${appliedCount} migration(s).`);
    }
};

if (require.main === module) {
    try {
        runMigrations();
        closeDB();
        process.exit(0);
    } catch (error) {
        logger.error("Migration failed:", error);
        closeDB();
        process.exit(1);
    }
}

module.exports = { runMigrations };
