const env = require("../config/env");
const ingestionEngine = require("../integrations/gmail/ingestion.engine");
const deletionSync = require("../integrations/gmail/deletion-sync");
const logger = require("../utils/logger");

let intervalHandle = null;
let isRunning = false;
let tickCount = 0;
const DELETION_SYNC_EVERY_N_TICKS = 20;

const runDeletionSyncTick = async () => {
    try {
        const results = await deletionSync.runDeletionSync({ mailbox: env.google.mailbox });
        if (results.removed > 0 || results.restored > 0 || results.errors.length > 0) {
            logger.info(
                `Gmail deletion-sync: checked=${results.checked} removed=${results.removed} ` +
                `ticketsRemoved=${results.ticketsRemoved} restored=${results.restored} errors=${results.errors.length}`
            );
        } else {
            logger.debug(`Gmail deletion-sync tick: checked=${results.checked}, nothing removed.`);
        }
        if (results.errors.length > 0) {
            logger.error("Gmail deletion-sync errors:", results.errors);
        }
    } catch (error) {
        logger.error("Gmail deletion-sync failed:", error);
    }
};

const runOnce = async () => {
    if (isRunning) {
        logger.warn("Gmail sync job: previous run still in progress, skipping this tick.");
        return;
    }
    isRunning = true;
    try {
        const results = await ingestionEngine.runSync({ mailbox: env.google.mailbox });
        const summary = `fetched=${results.fetched} ingested=${results.ingested} ` +
            `skipped=${results.skipped} ticketsCreated=${results.ticketsCreated} ` +
            `attachmentsSaved=${results.attachmentsSaved} errors=${results.errors.length}`;

        if (results.ingested > 0 || results.errors.length > 0) {
            logger.info(`Gmail sync job: ${summary}`);
        } else {
            // Quiet tick: debug level only, so normal logs aren't spammed every interval.
            logger.debug(`Gmail sync job tick: ${summary}`);
        }
        if (results.errors.length > 0) {
            logger.error("Gmail sync job errors:", results.errors);
        }

        tickCount += 1;
        if (tickCount % DELETION_SYNC_EVERY_N_TICKS === 0) {
            await runDeletionSyncTick();
        }
    } catch (error) {
        logger.error("Gmail sync job failed:", error);
    } finally {
        isRunning = false;
    }
};

// Logged no-op (not an error) when sync is disabled or GOOGLE_REFRESH_TOKEN hasn't been captured yet.
const startGmailSyncJob = () => {
    if (!env.google.syncEnabled) {
        logger.info("Gmail sync job disabled (GMAIL_SYNC_ENABLED=false).");
        return;
    }
    if (!env.google.refreshToken) {
        logger.warn(
            "Gmail sync job not started: GOOGLE_REFRESH_TOKEN is not set yet. " +
            "Complete GET /api/v1/gmail/auth-url once, save the refresh token, then restart the server."
        );
        return;
    }

    logger.info(`Gmail sync job started: polling every ${env.google.syncIntervalMs}ms.`);
    runOnce();
    intervalHandle = setInterval(runOnce, env.google.syncIntervalMs);
};

const stopGmailSyncJob = () => {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }
};

module.exports = { startGmailSyncJob, stopGmailSyncJob };
