const gmailClient = require("../integrations/gmail/gmail.client");
const ingestionEngine = require("../integrations/gmail/ingestion.engine");
const deletionSync = require("../integrations/gmail/deletion-sync");
const env = require("../config/env");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

// Gmail setup step 1: open this URL, sign in as GMAIL_MAILBOX and grant access.
const getAuthUrl = (req, res, next) => {
    try {
        const url = gmailClient.getAuthUrl();
        ok(res, HTTP_STATUS.OK, { url });
    } catch (error) {
        next(error);
    }
};

// Step 2 (one-time setup): exchange ?code= for tokens; save the returned refresh token as GOOGLE_REFRESH_TOKEN.
const oauthCallback = async (req, res, next) => {
    try {
        const { code } = req.query;
        const tokens = await gmailClient.exchangeCodeForTokens(code);
        ok(res, HTTP_STATUS.OK, {
            message: "Save refresh_token to GOOGLE_REFRESH_TOKEN in server/.env, then restart the server.",
            refresh_token: tokens.refresh_token || null,
            access_token_expiry: tokens.expiry_date || null,
            scope: tokens.scope || null
        });
    } catch (error) {
        next(error);
    }
};

/** Manually triggers one ingestion pass (until a scheduled job exists). */
const sync = async (req, res, next) => {
    try {
        const mailbox = req.body && req.body.mailbox ? req.body.mailbox : env.google.mailbox;
        const results = await ingestionEngine.runSync({ mailbox });
        ok(res, HTTP_STATUS.OK, results);
    } catch (error) {
        next(error);
    }
};

/** Manually triggers a deletion-sync pass (checks for mail removed from Gmail since it was ingested). */
const syncDeletions = async (req, res, next) => {
    try {
        const mailbox = req.body && req.body.mailbox ? req.body.mailbox : env.google.mailbox;
        const results = await deletionSync.runDeletionSync({ mailbox });
        ok(res, HTTP_STATUS.OK, results);
    } catch (error) {
        next(error);
    }
};

module.exports = { getAuthUrl, oauthCallback, sync, syncDeletions };
