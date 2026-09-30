const app = require("./app");
const env = require("./config/env");
const { connectDB, closeDB } = require("./config/db");
const { runMigrations } = require("./database/migrate");
const { startGmailSyncJob, stopGmailSyncJob } = require("./jobs/gmail-sync.job");
const { startEscalationWatchJob, stopEscalationWatchJob } = require("./jobs/escalation-watch.job");
const { attachWebSocketHub } = require("./realtime/ws-hub");
const logger = require("./utils/logger");

const startServer = () => {
    try {
        connectDB();
        runMigrations();

        const server = app.listen(env.port, () => {
            logger.info(`Vision Support Desk API listening on port ${env.port} (${env.nodeEnv})`);
            startGmailSyncJob();
            startEscalationWatchJob();
        });
        // Live updates for the browser (replaces client-side polling).
        const wss = attachWebSocketHub(server);

        const shutdown = (signal) => {
            logger.info(`${signal} received, shutting down...`);
            stopGmailSyncJob();
            stopEscalationWatchJob();
            for (const socket of wss.clients) socket.terminate();
            wss.close();
            server.close(() => {
                closeDB();
                process.exit(0);
            });
        };

        process.on("SIGINT", () => shutdown("SIGINT"));
        process.on("SIGTERM", () => shutdown("SIGTERM"));
    } catch (error) {
        logger.error("Failed to start server:", error);
        process.exit(1);
    }
};

startServer();
