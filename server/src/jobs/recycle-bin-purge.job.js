const logger = require("../utils/logger");

// Purges expired recycle-bin tickets at start-up then hourly; restore is refused from the exact expiry moment.
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
