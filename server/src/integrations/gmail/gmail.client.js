const { google } = require("googleapis");
const env = require("../../config/env");
const ApiError = require("../../utils/api-error");
const ERROR_CODES = require("../../constants/error-codes");
const HTTP_STATUS = require("../../constants/http-status");

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const createOAuthClient = () => {
    if (!env.google.clientId || !env.google.clientSecret || !env.google.redirectUri) {
        throw new ApiError(
            HTTP_STATUS.INTERNAL_SERVER_ERROR,
            ERROR_CODES.GMAIL_NOT_CONFIGURED,
            "Gmail OAuth client is not configured. Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI."
        );
    }
    return new google.auth.OAuth2(env.google.clientId, env.google.clientSecret, env.google.redirectUri);
};

/** Step 1 of the Gmail Console setup flow: build the consent URL. */
const getAuthUrl = () => {
    const client = createOAuthClient();
    return client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: SCOPES
    });
};

/** Step 2: exchange the consent callback's ?code= for tokens. */
const exchangeCodeForTokens = async (code) => {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(code);
    return tokens;
};

/**
 * Authenticated Gmail API client for ongoing ingestion, using the
 * long-lived refresh token captured once during Gmail Console setup.
 */
const getGmailClient = () => {
    if (!env.google.refreshToken) {
        throw new ApiError(
            HTTP_STATUS.INTERNAL_SERVER_ERROR,
            ERROR_CODES.GMAIL_NOT_CONFIGURED,
            "GOOGLE_REFRESH_TOKEN is not set. Complete GET /api/v1/gmail/auth-url once, then save the returned refresh token to .env."
        );
    }
    const client = createOAuthClient();
    client.setCredentials({ refresh_token: env.google.refreshToken });
    return google.gmail({ version: "v1", auth: client });
};

/**
 * The mail the support desk mirrors: everything Gmail DELIVERED to the
 * mailbox (direct, Cc, Bcc, and mail to a group the mailbox belongs to - the
 * address need not be in To/Cc), anything addressed to it (Gmail-generated
 * bounces carry no Delivered-To), and everything the mailbox sent. Shared by
 * the import sync and the deletion sync, which must see the same set or a
 * message would look deleted.
 */
const mailboxQuery = (mailbox) => `{deliveredto:${mailbox} to:${mailbox} from:${mailbox}}`;

module.exports = { getAuthUrl, exchangeCodeForTokens, getGmailClient, mailboxQuery, SCOPES };
