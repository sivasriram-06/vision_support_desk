# Vision Support Desk

A support ticketing desk for the Sunoida support team. Customer mail arriving in the support Gmail mailbox becomes a ticket automatically. Agents then assign, work, track and close those tickets against each bank's SLA, with escalations, holidays and live updates built in.

- **Client:** React 19, Vite, Tailwind CSS v4 (`client/`, port **4545**)
- **Server:** Node.js 22, Express, better-sqlite3, WebSocket (`server/`, port **3456**)
- **Database:** SQLite file (`server/data/vision_support_desk.db`)
- **Mail:** Google Gmail API, read-only (OAuth refresh token)

---

## Contents

1. [Functionality](#1-functionality)
2. [Prerequisites](#2-prerequisites)
3. [Setup procedure](#3-setup-procedure)
4. [Environment variables](#4-environment-variables)
5. [Commands to run](#5-commands-to-run)
6. [Migrations](#6-migrations)
7. [Seed](#7-seed)
8. [First sign-in and connecting Gmail](#8-first-sign-in-and-connecting-gmail)
9. [Starting over with a fresh database](#9-starting-over-with-a-fresh-database)
10. [Project structure](#10-project-structure)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Functionality

### 1.1 Gmail ingestion (mail to ticket)
- A background job runs every `GMAIL_SYNC_INTERVAL_MS` (default 60 s) and pulls mail for `GMAIL_MAILBOX`.
- It imports mail sent to the mailbox directly, in To or Cc, by Bcc, or through a Google Group. It also imports mail sent from the mailbox.
- **New mail creates a ticket.** The ticket's created time is the time Gmail received the mail, shown in IST.
- **Replies join their existing ticket.** Matching uses `In-Reply-To` / `References`. If a ticket was split, a reply to the old mail follows the split onto the new ticket.
- **Every sender is stored as a contact**, including agents. Attachments are saved to disk under `ATTACHMENTS_DIR`.
- Imports are idempotent: each Gmail message id is recorded, so a message is never imported twice.
- **Deletion sync:** mail deleted in Gmail is soft-deleted on the ticket. If a ticket loses all its mail, the ticket is hidden too. If the mail is moved back from Trash, it comes back.

### 1.2 Tickets
- **All Tickets:** search, filter, sort and paginate every ticket. There is an "include closed" option.
- **My Tickets:** tickets assigned to you. The counts follow the "include closed" box.
- **Ticket detail:** the full conversation (mail, replies and internal comments), attachments and the property panel. The panel holds bank, priority, department, product, classification, category, status and due date. Also on the page: history and tracking.
- Ticket ids are 6-digit numbers per table, starting at 100000, shown as `#000123`.
- **Delete ticket (Admin, Manager, Team Lead only):** the ticket leaves every list and queue and moves to the **Recycle Bin**, with who deleted it and when.
- **Recycle Bin** (same roles): a deleted ticket can be restored for `RECYCLE_BIN_DAYS` days (default 30). After that it is **permanently deleted** with its mails, notes, history and attachment files. A job checks every hour. Its mails stay in Gmail but are never imported again. Tickets hidden because their mail was deleted in Gmail are not in the bin; they follow the mailbox.
- Ticket numbers keep counting up and are never reused, even after a permanent delete.

### 1.3 Assignment
- **Only Admin, Manager, Team Lead or Assistant Team Lead can make the first assignment.** After that, the current assignees can add others.
- Cross-team assignment lists every team, including the product teams (Java, Angular).
- A lead of the ticket's own team can remove cross-team assignees.

### 1.4 Statuses and resolution time
Each status carries a clock behaviour (editable on the Config page):

| Status | Resolution clock |
|---|---|
| Unassigned | Not started |
| Open, In Progress | Running |
| In Progress - Client, On Hold - Client, On Hold - Dependent | Paused |
| Resolved, Resolved - Under Observation | Running |
| Closed | Stopped |

- **Resolution time** counts only the bank's IST support window on working days. The default window is 10:30–19:30. A 24×7 bank counts every minute.
- The clock ticks live on the ticket page.
- **Once a ticket is Closed, it can't be moved back to an open status.** Closed tickets re-enter work only through the flow in 1.6.

### 1.5 SLA and escalations
- **SLA due date** = SLA start time + the priority's SLA hours, counted on the bank's calendar (its working days and time zone).
- Default priorities: **P1 = 24 h, P2 = 72 h, P3 = 240 h.**
- **The SLA never pauses for status.** Only resolution time pauses.
- **Escalation levels** fire at the due date plus an offset per priority. For example, P1 level 1 fires 4 h before the due date, level 2 at the due date, and level 3 8 h after it.
- A job checks every minute and the **Escalations** page updates live.
- When a calendar input changes (bank hours or days, holidays, the 24×7 setting), open tickets are re-dated and closed tickets' resolution times are recomputed.

### 1.6 Reply after close: reopen, new issue or no action
- When a customer mails on a **Closed** ticket, the ticket is flagged for a decision by a lead.
- **Reopen:** counts as a reopen. The SLA restarts from the reopen time, and the ticket comes back unassigned.
- **New issue:** splits the mail into a new ticket. All properties are copied, and the lead can edit them before creating it.
- **No action needed:** for acknowledgement mails such as "thanks".

### 1.7 Holiday calendar
- Company holidays are whole IST days. The **SLA, escalations and resolution time skip them like a weekend.**
- 24×7 banks skip holidays only when **"apply holidays to 24×7 banks"** is on. It is off by default.
- Holidays are managed on the Config page by Admin, Manager or Team Lead. The page has a year view and shows the impact before you save.
- **Holiday timer:** work done on a holiday adds to resolution time only, never to the SLA. It stops automatically at midnight IST and offers a work log when stopped.
- The seed loads the 9 company holidays for 2026.

### 1.8 Customers
- Customers are the Gmail senders. The page shows name and email, with **All / Open / Closed / Overdue** ticket counts.
- Opening a customer lists the tickets that came from them. Clicking a count card (All / Open / Closed / Overdue) filters that list.
- Admin, Manager, Team Lead and Assistant Team Lead can see the page and edit name and bank.
- The customer list starts empty. It fills from incoming mail and is not seeded.

### 1.9 Banks, teams, agents, config and admin
- **Banks:** each bank's support team, level, time zone, working days, support hours (IST), 24×7 flag, and primary and secondary resources.
- **Agents:** add, edit, deactivate and move agents between teams.
- **Config:** priorities and SLA hours, escalation offsets, statuses and their clock behaviour, classifications and categories, products, and holidays.
- **Admin:** role permissions, user access, passwords, and the mail integration status ("Connect Gmail").

### 1.10 Sign-in, roles and permissions
- Agents sign in with email and password, and receive a JWT.
- Seeded agents get a temporary password and must change it on first sign-in.
- Too many failed attempts lock the account for `LOCK_MINUTES`.
- Deactivating an agent, revoking a sign-in or issuing a temporary password closes that agent's live sessions immediately.

Default permissions per role. Admins can change these on the Admin page; re-seeding never overwrites those changes.

| Permission | Admin | Manager | Team Lead | Asst. TL | Member |
|---|:-:|:-:|:-:|:-:|:-:|
| View tickets, reply & comment, edit status | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create tickets, edit properties, assign within team | ✓ | ✓ | ✓ | ✓ | |
| Reopen / split closed tickets | ✓ | ✓ | ✓ | ✓ | |
| Customers page | ✓ | ✓ | ✓ | ✓ | |
| Delete and restore tickets (Recycle Bin), manage holidays | ✓ | ✓ | ✓ | | |
| Assign to anyone, manage agents, banks & teams, config, Admin page | ✓ | ✓ | | | |

### 1.11 Live updates
- The browser keeps one WebSocket open to `/ws`, authenticated with the JWT. Pages don't poll.
- When data changes, the server sends a small event (ids only). Open pages refetch through the normal REST API, so permissions still apply.
- What updates live: ticket lists, queues, My Tickets, Escalations, Customers, the sidebar badges and the open ticket.
- If you are editing a ticket and someone else changes it, a **Reload** bar appears instead of overwriting your edit.

### 1.12 Timestamps
Every timestamp is stored and shown in **IST** as ISO text with the `+05:30` offset (for example `2026-10-05T14:30:00.000+05:30`).

---

## 2. Prerequisites

- **Node.js 22 or newer** (`node -v`) and npm.
- Build tools for `better-sqlite3`, needed only if npm can't download a prebuilt binary. On Windows that means the "Desktop development with C++" workload.
- A **Google Cloud project** with the Gmail API enabled and an OAuth client. Section 3, step 4 covers this.
- Access to the support mailbox, so you can sign in as it once and grant read access.

---

## 3. Setup procedure

**Step 1: Get the code and install.** This is an npm workspace, so one install covers the client and the server.

```bash
git clone <repo-url> support_desk
```
```bash
cd support_desk
```
```bash
npm install
```

**Step 2: Create the server env file.** Copy the example, then fill in the values listed in [section 4.1](#41-server-serverenv).

```bash
cp server/.env.example server/.env
```

**Step 3: Create the client env file.** Copy the example, then set `VITE_API_BASE_URL` ([section 4.2](#42-client-clientenv)).

```bash
cp client/.env.example client/.env
```

**Step 4: Set up the Google OAuth client.** Full walkthrough: [`docs/development/gmail-console-setup.md`](docs/development/gmail-console-setup.md).
1. In Google Cloud Console, enable the **Gmail API**.
2. Configure the OAuth consent screen. Choose **Internal** for a Workspace domain, and add the scope `https://www.googleapis.com/auth/gmail.readonly`.
3. Create an **OAuth client ID** of type Web application. Set the redirect URI to `http://localhost:3456/api/v1/gmail/oauth2callback`. It must match `GOOGLE_REDIRECT_URI` exactly.
4. Put the Client ID and Client Secret into `server/.env`. Leave `GOOGLE_REFRESH_TOKEN` empty for now; [section 8](#8-first-sign-in-and-connecting-gmail) fills it in.

**Step 5: Create the database tables.** See [section 6](#6-migrations).

```bash
npm run migrate
```

**Step 6: Load the base data.** See [section 7](#7-seed).

```bash
npm run seed
```

**Step 7: Start the app.** See [section 5](#5-commands-to-run).

```bash
npm run dev
```

**Step 8: Sign in and connect Gmail.** See [section 8](#8-first-sign-in-and-connecting-gmail).

> `server/.env`, `client/.env`, `server/data/` (the database) and `.claude/` are git-ignored. Never commit secrets.

---

## 4. Environment variables

### 4.1 Server (`server/.env`)

`server/src/config/env.js` validates these at startup. If a required value is missing or invalid, the server refuses to start and names the variable.

| Variable | Required | Example / default | Purpose |
|---|:-:|---|---|
| `NODE_ENV` | ✓ | `development` | `development` or `production`. |
| `PORT` | ✓ | `3456` | API and WebSocket port. |
| `DATABASE_PATH` | ✓ | `./data/vision_support_desk.db` | SQLite file, relative to `server/`. The folder is created if missing. |
| `TIMEZONE` | ✓ | `Asia/Kolkata` | IANA zone for log timestamps and the default bank time zone at seed time. Stored timestamps are always IST. |
| `LOG_TO_FILE` | ✓ | `true` | `true` / `false`. Writes `logs/<date>.log` and `logs/error-<date>.log`. |
| `LOG_DIR` | ✓ | `logs` | Log folder, relative to `server/`. |
| `ATTACHMENTS_DIR` | ✓ | `./uploads/attachments` | Where mail attachments are stored on disk. |
| `RECYCLE_BIN_DAYS` | ✓ | `30` | Days a deleted ticket can be restored from the Recycle Bin before it is permanently deleted. |
| `JWT_SECRET` | ✓ | *(long random string)* | Signs sign-in tokens. Changing it signs everyone out. |
| `JWT_EXPIRES_IN` | ✓ | `1d` | Token lifetime (`8h`, `1d`, …). |
| `SYSTEM_AGENT_EMAIL` | ✓ | `system@sunoida.com` | Email of the hidden system agent the seed creates. It owns records made by Gmail ingestion and never appears on screen. If you change it later, re-run the seed. |
| `SEED_DEFAULT_PASSWORD` | | *(empty)* | Seed only. The temporary password given to each seeded agent without a sign-in; they must change it on first login. Leave empty to issue passwords from the Admin page instead. |
| `GOOGLE_CLIENT_ID` | ✓ | | OAuth client ID (setup step 4). |
| `GOOGLE_CLIENT_SECRET` | ✓ | | OAuth client secret (setup step 4). |
| `GOOGLE_REDIRECT_URI` | ✓ | `http://localhost:3456/api/v1/gmail/oauth2callback` | Must match the redirect URI on the OAuth client exactly. |
| `GOOGLE_REFRESH_TOKEN` | | *(empty at first)* | Filled in after "Connect Gmail" ([section 8](#8-first-sign-in-and-connecting-gmail)). The server starts without it, but mail sync stays off. |
| `GMAIL_MAILBOX` | ✓ | `tasks@sunoida.com` | The support mailbox to import. Changing it is an `.env` change plus a re-seed (the seed creates its reply-address row). |
| `GMAIL_SYNC_ENABLED` | ✓ | `true` | `true` / `false`. Turns the background sync job on or off. |
| `GMAIL_SYNC_INTERVAL_MS` | ✓ | `60000` | How often the sync runs, in milliseconds. |
| `MAX_FAILED_ATTEMPTS` | ✓ | `5` | Failed sign-ins allowed before the account locks. |
| `LOCK_MINUTES` | ✓ | `10` | How long a locked account stays locked. |

To generate a `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4.2 Client (`client/.env`)

| Variable | Example | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3456` | Server address for REST calls and the `/ws` WebSocket. It is baked in at build time, so rebuild the client after changing it. |

---

## 5. Commands to run

Run every command from the **repo root**. Run the migrations (section 6) and the seed (section 7) once before the first start.

| Command | What it does |
|---|---|
| `npm install` | Installs client and server dependencies. |
| `npm run dev` | Starts the server (nodemon, auto-restart) and the client (Vite) together. |
| `npm run dev:server` | Starts the server only, on http://localhost:3456. |
| `npm run dev:client` | Starts the client only, on http://localhost:4545. |
| `npm run build` | Builds the client into `client/dist/`. |
| `npm start` | Starts the server without nodemon (production). |
| `npm run migrate` | Applies pending database migrations. |
| `npm run seed` | Loads the base data. Safe to repeat. |
| `npm test -w server` | Runs the server unit tests (`node:test`). |
| `npm run lint -w client` | Lints the client. |

**Development:** run `npm run dev`, then open http://localhost:4545. The API health check is http://localhost:3456/health.

**Production:**

```bash
npm run migrate
```
```bash
npm run seed
```
```bash
npm run build
```
```bash
npm start
```

The server doesn't serve the client's files. Host `client/dist/` on any static web server, or run `npm run preview -w client` on port 4545. Before building, set `VITE_API_BASE_URL` to the server's public address. Set `NODE_ENV=production` in `server/.env`.

---

## 6. Migrations

```bash
npm run migrate
```

- Runs `server/src/database/migrate.js`. It applies each file in `server/src/database/migrations/` in name order (`0001_…sql` to `0031_…sql`), each in its own transaction.
- Applied files are recorded in the `_migrations` table, so running it again applies only new files.
- If the database file doesn't exist yet, it is created.

Rules for schema changes:
- **Migrations only create; they never alter.** Each file creates one table and its indexes.
- **A new table gets a new numbered file**, for example `0032_hd_something.sql`.
- In a throwaway or test database, you can change an existing table by editing its CREATE file and rebuilding the database ([section 9](#9-starting-over-with-a-fresh-database)).
- **Never rebuild a database that holds real tickets.** Back it up first, and plan the change as a new table or a data script.

---

## 7. Seed

```bash
npm run seed
```

Runs `server/src/database/seed.js`. The seed is idempotent: it only adds rows that are missing, and it never overwrites values an admin has since edited. It loads:

| Data | Source |
|---|---|
| Organization (Sunoida), default department, system agent, mail reply address for `GMAIL_MAILBOX` | `seed.js` and `server/.env` |
| Roles (Admin, Manager, Team Lead, Assistant Team Lead, Team Member) with default permissions | `server/src/constants/permissions.js` |
| Support teams, admin and agent roster with their teams and roles | `seed-data/support-org.json` |
| Product teams (Java Team, Angular Team) and their agents | `seed-data/product-teams.json` |
| Banks: support team, level, country time zone, working days, support hours, 24×7, resources | `seed-data/banks.json` |
| Statuses and clock behaviour, team types, classifications and categories, products, priority SLA hours, escalation levels, 2026 company holidays | `seed-data/config.json` |

Notes:
- **Sign-in credentials** are created only when `SEED_DEFAULT_PASSWORD` is set. Each seeded agent gets that password as a temporary one and must change it at first sign-in. Without it, the seed warns you, and an Admin issues passwords from the Admin page.
- **Customers and tickets are not seeded.** They come from Gmail.
- If you change `GMAIL_MAILBOX`, re-run the seed so a reply-address row exists for the new mailbox.

---

## 8. First sign-in and connecting Gmail

1. Open http://localhost:4545 and sign in as the seeded admin (`vision.support@sunoida.com`) with `SEED_DEFAULT_PASSWORD`. Set a new password when asked.
2. Go to **Admin → Mail Integration** and click **Connect Gmail**.
3. Sign in to Google **as the `GMAIL_MAILBOX` account** and allow read access.
4. Google redirects to `/api/v1/gmail/oauth2callback`, which shows a `refresh_token`. Copy it into `server/.env` as `GOOGLE_REFRESH_TOKEN`.
5. Restart the server. On the first sync, which runs within `GMAIL_SYNC_INTERVAL_MS`, mail starts arriving as tickets.

An Admin can also trigger a sync by hand with `POST /api/v1/gmail/sync` or `POST /api/v1/gmail/sync-deletions`.

---

## 9. Starting over with a fresh database

**This deletes every ticket.** Use it only on a test machine, and keep a copy first.

1. Stop the server.
2. Delete the database file and its `-wal` / `-shm` files from `server/data/`:
   - `vision_support_desk.db`
   - `vision_support_desk.db-wal`
   - `vision_support_desk.db-shm`
3. Rebuild and reload:

```bash
npm run migrate
```
```bash
npm run seed
```
```bash
npm run dev
```

Gmail import then rebuilds the tickets from the mailbox.

To back up a live database without stopping the server, run this from `server/`:

```bash
node -e "require('better-sqlite3')('data/vision_support_desk.db').exec(\"VACUUM INTO 'data/backup.db'\")"
```

---

## 10. Project structure

```
support_desk/
├── client/                      React + Vite + Tailwind
│   └── src/
│       ├── pages/               Tickets, My Tickets, Ticket detail, Escalations, Customers,
│       │                        Agents, Banks, Config, Admin, Login, Change password
│       ├── components/          layout/, tickets/, settings/, ui/
│       ├── auth/                session + client-side permission keys
│       ├── realtime/            RealtimeProvider + useRealtime (WebSocket)
│       └── utils/               api.js (axios), format.js (IST display)
├── server/
│   ├── src/
│   │   ├── routes/v1/           /api/v1/* endpoints
│   │   ├── controllers/  services/  repositories/   request → logic → SQL
│   │   ├── services/sla/        business calendar, SLA, escalations, resolution clock, holidays
│   │   ├── integrations/gmail/  Gmail client, normalizer, ingestion + deletion sync
│   │   ├── realtime/            event bus + WebSocket hub (/ws)
│   │   ├── jobs/                Gmail sync job, escalation watch job
│   │   ├── database/            migrate.js, migrations/, seed.js, seed-data/
│   │   ├── constants/  schemas/  middleware/  models/  config/  utils/
│   │   └── server.js / app.js
│   ├── data/                    SQLite database (git-ignored)
│   ├── logs/                    daily log files
│   └── uploads/                 attachments
├── docs/                        design references, ER diagram, Gmail console setup
└── postman/                     API collection
```

The request flow is `Route → Middleware (auth, permission, Joi validation) → Controller → Service → Repository → SQLite`. Services publish realtime events after a transaction commits.

---

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| `X not found in env` on start | That variable is missing or empty in `server/.env` ([section 4.1](#41-server-serverenv)). |
| `EADDRINUSE :3456` | Another server is already running. Stop the old Node process. |
| `MAIL_REPLY_ADDRESS_NOT_FOUND` | Run `npm run seed`, and again after changing `GMAIL_MAILBOX`. |
| `GMAIL_NOT_CONFIGURED` on sync | `GOOGLE_REFRESH_TOKEN` is empty. Redo [section 8](#8-first-sign-in-and-connecting-gmail). |
| `invalid_grant` in `logs/error-*.log` | The refresh token was revoked or expired. Reconnect Gmail and replace the token. |
| `redirect_uri_mismatch` from Google | `GOOGLE_REDIRECT_URI` must match the OAuth client's redirect URI byte for byte. |
| `ETIMEDOUT oauth2.googleapis.com` | A network problem. The next sync picks up any missed mail. |
| No seeded user can sign in | `SEED_DEFAULT_PASSWORD` was empty during the seed. Set it and re-run `npm run seed`, or issue passwords from the Admin page. |
| Pages don't update live | Check that `VITE_API_BASE_URL` points at the server and that `/ws` isn't blocked by a proxy. |
