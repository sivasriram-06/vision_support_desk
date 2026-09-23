const env = require("../config/env");
const ingestionEngine = require("../integrations/gmail/ingestion.engine");
const deletionSync = require("../integrations/gmail/deletion-sync");
const logger = require("../utils/logger");

let intervalHandle = null;
let isRunning = false;
let tickCount = 0;

// Deletion-sync has to re-list the WHOLE matching query every run (no
// early-stop is possible for a diff), so it rides along on the same
// interval as the main sync but only actually runs every Nth tick instead
// of every tick - the main sync's incremental, early-stopping walk is cheap
// enough to run every time; a full re-list isn't worth doing that often.
const DELETION_SYNC_EVERY_N_TICKS = 20;

const runDeletionSyncTick = async () => {
    try {
        const results = await deletionSync.runDeletionSync({ mailbox: env.google.mailbox });
        if (results.removed > 0 || results.errors.length > 0) {
            logger.info(
                `Gmail deletion-sync: checked=${results.checked} removed=${results.removed} ` +
                `ticketsRemoved=${results.ticketsRemoved} errors=${results.errors.length}`
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
            // Quiet tick (nothing new) - only visible with LOG_LEVEL=debug,
            // so normal logs aren't spammed every interval.
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

/**
 * Starts the interval-based background sync. A no-op (with a log line
 * explaining why) if GMAIL_SYNC_ENABLED=false or GOOGLE_REFRESH_TOKEN hasn't
 * been captured yet (docs/development/gmail-console-setup.md step 5) -
 * neither of those is a startup error, just a "not configured yet" state.
 */
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
