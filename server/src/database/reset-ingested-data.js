const fs = require("fs");
const path = require("path");
const { connectDB, closeDB } = require("../config/db");
const env = require("../config/env");
const logger = require("../utils/logger");

// One-off: wipes all Gmail-ingested data (keeps seeded setup) so the sync can rebuild from a clean slate.

// Children before the tables they reference; _GMAIL_INGESTED_MESSAGE references both ticket tables, so first.
const TABLES_TO_CLEAR = [
    "_GMAIL_INGESTED_MESSAGE",
    "HD_TICKET_TAG_MAP",
    "HD_TICKET_ATTACHMENT",
    "HD_TICKET_METRICS",
    "HD_TICKET_RESOLUTION",
    "HD_TICKET_HISTORY",
    "HD_TICKET_COMMENT",
    "HD_TICKET_THREAD",
    "HD_TICKET_CONVERSATION",
    "HD_TICKET_MASTER",
    "HD_CONTACT_ACCOUNT_MAP",
    "HD_CUSTOMER_HAPPINESS",
    "HD_CONTACT_MASTER"
];

const reset = () => {
    const db = connectDB();

    const txn = db.transaction(() => {
        for (const table of TABLES_TO_CLEAR) {
            const { changes } = db.prepare(`DELETE FROM ${table}`).run();
            logger.info(`Cleared ${changes} row(s) from ${table}`);
        }
    });
    txn();

    const attachmentsRoot = path.resolve(process.cwd(), env.attachmentsDir);
    if (fs.existsSync(attachmentsRoot)) {
        fs.rmSync(attachmentsRoot, { recursive: true, force: true });
        logger.info(`Removed attachment files under ${attachmentsRoot}`);
    }

    logger.info("Reset complete. Org/department/system agent/channel/mail-reply-address were left intact.");
};

if (require.main === module) {
    try {
        reset();
        closeDB();
        process.exit(0);
    } catch (error) {
        logger.error("Reset failed:", error);
        closeDB();
        process.exit(1);
    }
}

module.exports = { reset };
