const logger = require("../utils/logger");

/**
 * Permanently deletes tickets that have been in the recycle bin longer than
 * RECYCLE_BIN_DAYS (recycle-bin.service.purgeExpired). Runs once at start-up
 * and then hourly - a ticket is purged within an hour of its time running
 * out, and restore is refused from the exact moment it runs out.
 */
const PURGE_INTERVAL_MS = 60 * 60 * 1000;
let handle = null;

const runOnce = () => {
    try {
        const { purged } = require("../services/recycle-bin.service").purgeExpired();
        if (purged > 0) logger.info(`Recycle bin purge: ${purged} ticket(s) permanently deleted.`);
    } catch (error) {
        logger.error("Recycle bin purge failed:", error);
    }
};

const startRecycleBinPurgeJob = () => {
    if (handle) return;
    runOnce();
    handle = setInterval(runOnce, PURGE_INTERVAL_MS);
};

const stopRecycleBinPurgeJob = () => {
    if (handle) clearInterval(handle);
    handle = null;
};

module.exports = { startRecycleBinPurgeJob, stopRecycleBinPurgeJob };
