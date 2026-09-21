const env = require("../config/env");
const ingestionEngine = require("../integrations/gmail/ingestion.engine");
const logger = require("../utils/logger");

let intervalHandle = null;
let isRunning = false;

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
