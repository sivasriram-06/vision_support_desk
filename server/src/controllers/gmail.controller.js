const gmailClient = require("../integrations/gmail/gmail.client");
const ingestionEngine = require("../integrations/gmail/ingestion.engine");
const env = require("../config/env");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

/**
 * Step 1 of Gmail Console setup: open this URL, sign in as GMAIL_MAILBOX
 * (see server/.env), grant access.
 */
const getAuthUrl = (req, res, next) => {
    try {
        const url = gmailClient.getAuthUrl();
        ok(res, HTTP_STATUS.OK, { url });
    } catch (error) {
        next(error);
    }
};

/**
 * Step 2: Google redirects here with ?code=. Exchange it for tokens and
 * return the refresh token once - save it to .env as GOOGLE_REFRESH_TOKEN.
 * This is a one-time setup endpoint, not part of the ongoing sync loop.
 */
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

module.exports = { getAuthUrl, oauthCallback, sync };
