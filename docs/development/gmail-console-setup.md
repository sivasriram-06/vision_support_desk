# Gmail Console Setup

How to wire the Vision Support Desk backend to a real Gmail mailbox. The code side of this (OAuth client, normalizer, idempotent ingestion engine) is already implemented in `server/src/integrations/gmail/` and `server/src/controllers/gmail.controller.js`. What's left is entirely on Google's side.

The mailbox is never hard-coded — it's `GMAIL_MAILBOX` in `server/.env`. It's currently set to `sivasriram.balasubramaniyan@sunoida.com` for testing and will move to `tasks@sunoida.com` (the real support inbox) once that account's access is set up; that's a one-line `.env` change, not a code change. `server/src/config/env.js` throws at startup if `GMAIL_MAILBOX` (or any other required var) is missing, so a typo or missing value fails loudly instead of silently ingesting the wrong mailbox.

## 1. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a new project (or reuse one your org controls for `sunoida.com`).
2. In **APIs & Services → Library**, search for **Gmail API** and click **Enable**.

## 2. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **Internal** if `sunoida.com` is a Google Workspace domain (recommended — restricts the app to your own domain, no Google review needed). Use **External** + **Testing** mode otherwise, and add whichever address `GMAIL_MAILBOX` is currently set to as a test user.
3. Add the scope `https://www.googleapis.com/auth/gmail.readonly` (this is the only scope `server/src/integrations/gmail/gmail.client.js` requests).

## 3. Create OAuth client credentials

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Authorized redirect URI: `http://localhost:5000/api/v1/gmail/oauth2callback` (must exactly match `GOOGLE_REDIRECT_URI` in `server/.env` — update both together if the port or host changes, e.g. for a deployed environment).
4. Save. Copy the **Client ID** and **Client Secret**.

## 4. Configure the backend

Put the values in `server/.env` (never commit this file):

```env
GOOGLE_CLIENT_ID=<client id from step 3>
GOOGLE_CLIENT_SECRET=<client secret from step 3>
GOOGLE_REDIRECT_URI=http://localhost:5000/api/v1/gmail/oauth2callback
GMAIL_MAILBOX=<the mailbox you're granting access to, e.g. tasks@sunoida.com>
```

Leave `GOOGLE_REFRESH_TOKEN` empty for now — the next step fills it in. Every other var here is required: `env.js` throws immediately on boot if one is missing, rather than silently defaulting.

## 5. Capture the refresh token (one-time)

With the server running (`npm run dev` inside `server/`):

1. `GET http://localhost:5000/api/v1/gmail/auth-url` → returns `{ "data": { "url": "..." } }`.
2. Open that URL in a browser, sign in as **whichever address `GMAIL_MAILBOX` is set to** (not necessarily your own personal account), and grant access.
3. Google redirects to `GOOGLE_REDIRECT_URI` with a `?code=`, which `oauth2callback` automatically exchanges for tokens and returns:
   ```json
   { "data": { "refresh_token": "1//...", "access_token_expiry": ..., "scope": "..." } }
   ```
4. Copy `refresh_token` into `server/.env` as `GOOGLE_REFRESH_TOKEN`, then restart the server.

This only needs to happen once — `gmail.client.js` uses the refresh token to mint new access tokens on every subsequent call.

## 6. Run ingestion

```
POST http://localhost:5000/api/v1/gmail/sync
Content-Type: application/json

{}
```

This fetches recent messages addressed to `GMAIL_MAILBOX`, and for each one: normalizes it, skips it if already ingested (idempotent via `HD_TICKET_THREAD.Message_Id_Header`), matches it to an existing ticket via `In-Reply-To`/`References` or creates a new one, upserts the sender as a contact, and stores the message as a conversation + thread. Response:

```json
{ "data": { "fetched": 3, "ingested": 3, "skipped": 0, "ticketsCreated": 2, "errors": [] } }
```

There's no scheduler wired up yet — `sync` is a manual trigger for now. A cron/background job to call it periodically is a Phase 1 follow-up (see `src/jobs/` in the backend architecture layout once that's added).

## Troubleshooting

- `GMAIL_NOT_CONFIGURED` from `/gmail/auth-url` → `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI` missing from `.env`.
- `GMAIL_NOT_CONFIGURED` from `/gmail/sync` → `GOOGLE_REFRESH_TOKEN` missing; redo step 5.
- `redirect_uri_mismatch` from Google → the URI in step 3 doesn't byte-for-byte match `GOOGLE_REDIRECT_URI`.
- `MAIL_REPLY_ADDRESS_NOT_FOUND` → run `npm run seed`; it creates the `HD_MAIL_REPLY_ADDRESS` row for `GMAIL_MAILBOX` that ingestion looks the owning department up by. If you change `GMAIL_MAILBOX` later, re-run `npm run seed` so a matching row exists for the new address.
- `Error: GMAIL_MAILBOX not found in env` (or any other var) → that key is missing or empty in `server/.env`; `env.js` refuses to start the app rather than guessing a default.
