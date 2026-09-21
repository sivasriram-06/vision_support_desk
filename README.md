# Vision Support Desk

A production-oriented support desk platform. Its workflows, UI and data model are engineered from a captured internal + public API reference of a real, in-production help-desk tenant (`sunoida.com`, 40 agents, 3,164 tickets, 1,158 contacts), documented module-by-module in [`docs/`](docs/). Those documents are the project's source of truth; this README summarizes and indexes them.

Inbound support email (target mailbox: `tasks@sunoida.com`, configured via `GMAIL_MAILBOX` in `server/.env`) is ingested via the Gmail API and converted into tickets, which agents then work through queues, conversations, and the full ticket lifecycle.

---

## 1. Source-of-truth documents

Before changing architecture, schema, or API contracts, read the relevant document below — they encode real captured behavior, not assumptions:

| Document | Contents |
|---|---|
| [`docs/Zoho_Desk_UI_Module_API_Reference.docx`](docs/Zoho_Desk_UI_Module_API_Reference.docx) | Module-by-module UI → API → DB mapping (10 modules), login/security model, global response contracts, implementation phase order |
| [`docs/Zoho_Desk_API_Design.xlsx`](docs/Zoho_Desk_API_Design.xlsx) | Captured API endpoint inventory, field definitions per module (Tickets, Accounts, Contacts, etc.), the clone's own `/api/v1` endpoint design, and API standards (pagination, errors, idempotency, concurrency, auth) |
| [`docs/Zoho_Desk_Table_Config.xlsx`](docs/Zoho_Desk_Table_Config.xlsx) | Full relational schema: 66 `HD_*` tables with field-level specs (type, length, mandatory, index, FK, allowed values, description) |
| [`docs/Zoho Task Breakdown.xlsx`](docs/Zoho%20Task%20Breakdown.xlsx) | Dated Phase 1 / Phase 2 sub-task schedule (2026-09-22 → 2026-10-05) |

Where these documents mark something as unverified, edition-dependent, or a "production design decision" rather than confirmed captured behavior, treat it as an assumption to validate during implementation, not as settled fact.

---

## 2. Current repository state

```
support_desk/
├── client/     — empty (React app not yet scaffolded)
├── server/     — empty (Node backend not yet scaffolded)
├── docs/       — source-of-truth reference documents (see above)
└── README.md
```

No code, package.json, migrations, or database file exist yet. This is a greenfield implementation guided by an already-completed reverse-engineering/design pass.

---

## 3. Technology stack

- **Frontend:** React.js, Tailwind CSS
- **Backend:** Node.js, Express.js
- **Database:** SQLite (production-grade relational modeling: FKs, indexes, migrations, transactions)
- **Email integration:** Google Gmail API (OAuth), mailbox `tasks@sunoida.com`

---

## 4. Architecture

Layered backend, no business logic in routes or SQL in controllers/React:

```
HTTP Request → Route → Middleware → Controller → Service → Repository → SQLite
```

External integrations (Gmail, etc.) go through an adapter, never called directly from a service:

```
Service → Integration Adapter → External API
```

Frontend is organized by feature module (`tickets`, `contacts`, `accounts`, `agents`, `teams`, `departments`, `reports`, `automation`, `activities`, `products`, `contracts`, `settings`), each with its own components, hooks, and API-layer calls — no direct fetch calls from UI components.

---

## 5. Authentication & authorization model

Per `docs/Zoho_Desk_UI_Module_API_Reference.docx` §2 and the `Auth_API_Design` / `Clone_API_Standards` sheets, this **deliberately does not clone a vendor login page** — it reproduces the captured production security architecture:

- Agent identity = **email address**, federated through an external identity provider (Google OAuth) — never a locally-stored password.
- `HD_AGENT_MASTER` never stores `Password`/`Password_Hash`.
- `HD_AGENT_AUTH` maps the external IdP subject + login email to the Desk agent.
- `HD_AGENT_SESSION` holds server-side session + CSRF binding.
- `HD_AUTH_LOGIN_EVENT` is the security audit log.
- Browser session = HttpOnly/Secure cookie; all state-changing requests require a CSRF token.
- Authorization is derived server-side from Role → Profile → Department/Team scope (`HD_ROLE_MASTER`, `HD_PROFILE_MASTER`, `HD_AGENT_DEPARTMENT_MAP`) — **never** from client-supplied `agentId`/`orgId`/permissions.

```
POST /api/v1/auth/login     — start IdP handoff
GET  /api/v1/auth/callback  — validate IdP response, create session
GET  /api/v1/auth/me        — current agent + role/profile/departments
POST /api/v1/auth/logout    — revoke session
GET  /api/v1/auth/csrf      — issue/rotate CSRF token
```

---

## 6. Modules (from the UI/Module/API reference)

| # | Module | Key sub-modules |
|---|---|---|
| 01 | Login & Security | IdP handoff, callback, `/me`, logout, session/CSRF |
| 02 | Analytics | Dashboards, folders, components, widget data, templates, Reports (Advanced Analytics excluded) |
| 03 | Tickets | All Cases, Agent Queue, Team Queue, Ticket Detail, Conversations, Threads, Comments, History, Resolution, Metrics, Attachments, Approvals, Followers, Tags, Time Entries |
| 04 | Contacts & Accounts | Contacts, Accounts, Customer Happiness |
| 05 | Agents & Organization | Agents, Departments, Teams, Roles, Profiles, Skills |
| 06 | Automation & Configuration | Views, Saved Filters, Macros, Business Hours, SLA, Assignment/Escalation Rules, Blueprints, Custom Fields, Layouts |
| 07 | Channels & Communication | Channels, Mail Reply Address, Feed, Notifications, Internal Chat |
| 08 | Products & Contracts | Products, Contracts |
| 09 | Activities | Tasks, Events, Calls |
| 10 | System & Org Settings | Organization, Module registry, Tags |

Full per-module UI → API → DB mapping, production rules, and open implementation notes live in `docs/Zoho_Desk_UI_Module_API_Reference.docx`.

---

## 7. Implementation phases

### Phase 1 — Ticket Management & Organization
Gmail ingestion → SQLite; ticket creation & property mapping; Agent Queue + Team Queue; All Cases (search/filter/sort/paginate); Ticket Detail; Conversations/threads/comments/attachments; Contacts + Accounts; Agents + Departments + Teams; ticket actions (assign, reassign, status, tags, followers, history, resolution); Phase 1 integration testing.

### Phase 2 — Reporting, Configuration & Business Operations
Reports; Configuration (layouts, custom fields, views, filters, business hours, SLA); Automation (rules/conditions/actions); Channels + email engine enhancements; Activities (Tasks/Calls/Events); Products + Contracts; remaining settings (roles, profiles, permissions, notifications, skills, org config); cross-module integration + regression testing.

The dated day-by-day breakdown (Sep 22 – Oct 5, 2026) is in `docs/Zoho Task Breakdown.xlsx`. The module reference document additionally proposes its own 6-phase priority order (Login → Tickets → Contacts/Agents/Teams → Analytics → Reports/Config/Automation → Channels/Activities/Products); reconcile the two before scheduling work — they don't fully agree on where Analytics/Dashboards land.

---

## 8. Database

SQLite with a normalized relational design, `HD_` ("Help Desk" — project-specific, not a Zoho convention) table prefix, full FK/index/CHAR-flag discipline. The complete schema (66 tables) is defined field-by-field in `docs/Zoho_Desk_Table_Config.xlsx`, sheet `Module_Index` for the index and one sheet per table for column-level specs. Categories:

- **Tickets (15 tables):** `HD_TICKET_MASTER` (54 columns) + `CONVERSATION`, `THREAD`, `COMMENT`, `HISTORY`, `RESOLUTION`, `METRICS`, `ATTACHMENT`, `APPROVAL`, `FOLLOWER`, `SECONDARY_CONTACT`, `TAG_MAP`, `TIME_ENTRY`, `CUSTOM_FIELD_VALUE`, `SCHEDULED_REPLY`
- **Contacts & Accounts (4):** `CONTACT_MASTER`, `ACCOUNT_MASTER`, `CUSTOMER_HAPPINESS`, `CONTACT_ACCOUNT_MAP`
- **Agents & Org Structure (10):** `AGENT_MASTER`, `AGENT_DEPARTMENT_MAP`, `AGENT_PREFERENCE`, `ROLE_MASTER`, `PROFILE_MASTER`, `DEPARTMENT_MASTER`, `TEAM_MASTER`, `TEAM_MEMBER_MAP`, `SKILL_MASTER`, `AGENT_SKILL_MAP`
- **Automation & Configuration (11):** `MACRO_MASTER`, `BUSINESS_HOURS_MASTER`, `SLA_POLICY_MASTER`, `VIEW_MASTER`, `VIEW_STAR_MAP`, `SAVED_FILTER`, `ASSIGNMENT_RULE_MASTER`, `ESCALATION_RULE_MASTER`, `BLUEPRINT_MASTER`, `CUSTOM_FIELD_DEFINITION`, `LAYOUT_MASTER`
- **Channels & Communication (5):** `CHANNEL_MASTER`, `MAIL_REPLY_ADDRESS`, `FEED_POST`, `NOTIFICATION_MASTER`, `CHAT_THREAD`
- **Products & Contracts (2):** `PRODUCT_MASTER`, `CONTRACT_MASTER`
- **Activities (3):** `TASK_MASTER`, `EVENT_MASTER`, `CALL_LOG_MASTER`
- **Analytics (9):** `DASHBOARD_TEMPLATE_CATEGORY`, `DASHBOARD_TEMPLATE_MASTER`, `COMPONENT_TEMPLATE_MASTER`, `DASHBOARD_MASTER`, `DASHBOARD_FOLDER`, `DASHBOARD_COMPONENT`, `DASHBOARD_ACCESS_MAP`, `REPORT_FOLDER`, `REPORT_MASTER`
- **System & Org Settings (3):** `ORGANIZATION_MASTER`, `MODULE_MASTER`, `TAG_MASTER`
- **Login & Security (3):** `AGENT_AUTH`, `AGENT_SESSION`, `AUTH_LOGIN_EVENT`

Tag architecture is master + mapping (`HD_TAG_MASTER` 1:N `HD_TICKET_TAG_MAP` N:1 `HD_TICKET_MASTER`) — tags are never duplicated per ticket.

**Do not scaffold all 66 tables in one pass.** Build them module-by-module, in the order the current implementation phase actually needs them, and validate each against the spec sheet as it's built.

---

## 9. API design

Versioned REST, base path `/api/v1`. Standards (from `Clone_API_Standards`):

- **Pagination:** default limit 50, max 100; cursor-based (`nextCursor`/`hasMore`), with offset supported for compatibility
- **Errors:** `{ "error": { "code", "message", "details", "traceId" } }`
- **List response:** `{ "data": [...], "paging": { "limit", "nextCursor", "hasMore" } }`
- **Single-resource response:** `{ "data": {...} }`
- **Idempotency:** POSTs that can create duplicate side effects (e.g. Gmail ingestion) accept an `Idempotency-Key`
- **Concurrency:** PATCH uses optimistic locking (`If-Match` / version field) on mutable resources (tickets, dashboards)
- **Audit:** every ticket mutation writes `HD_TICKET_HISTORY`; every auth/security event writes `HD_AUTH_LOGIN_EVENT`
- **Tenant isolation:** every query scoped by `Org_Id` from the authenticated session — never from the request body/client
- **Analytics:** dashboard/report widgets execute validated query definitions against an allow-listed field/aggregation registry; clients never submit raw SQL

The full endpoint list (Auth, Dashboard, Tickets, Contacts, Accounts, Agents, Config, Activities, Org) is in `Zoho_Desk_API_Design.xlsx` sheet `Clone_API_Endpoints`, with dedicated deep-dive sheets for `Auth_API_Design` and `Dashboard_API_Design`.

---

## 10. Gmail integration

```
Gmail API (GMAIL_MAILBOX)
   → Fetch messages
   → Validate / normalize
   → Identify sender → Find/create HD_CONTACT_MASTER
   → Find existing ticket (thread match) or create new HD_TICKET_MASTER
   → Save HD_TICKET_CONVERSATION (+ HD_TICKET_THREAD)
   → Assign (rule-based or default queue)
```

The Gmail provider message ID must be persisted and checked before creating a ticket/conversation, so re-processing the same message is a no-op (idempotent ingestion). OAuth credentials are never hard-coded or committed, and neither is the target mailbox — `server/src/config/env.js` throws at startup if any of these are missing rather than silently falling back to a default:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_REFRESH_TOKEN=
GMAIL_MAILBOX=
```

`GOOGLE_REFRESH_TOKEN` is the one deliberate exception — it's legitimately empty until the one-time OAuth consent flow (`GET /api/v1/gmail/auth-url`) completes, so the server must be able to boot without it. `GMAIL_MAILBOX` is currently set to a personal test address (`sivasriram.balasubramaniyan@sunoida.com`) while `tasks@sunoida.com` access is set up; swapping mailboxes later is a one-line `.env` change, no code change.

Ship a `.env.example` with empty values; never commit `.env`. Step-by-step Google Cloud Console setup (OAuth client, consent screen, capturing the refresh token) is in [`docs/development/gmail-console-setup.md`](docs/development/gmail-console-setup.md).

---

## 11. Development rules

**Never:** hard-code data into React · put SQL in routes/controllers/React · trust client-supplied `agentId`/`orgId`/permissions · expose Gmail/OAuth secrets to the frontend · duplicate business logic across frontend and backend · accept raw SQL from a dashboard/report client · create tables the current phase doesn't need yet.

**Always:** validate input and route params · authorize server-side · use transactions for multi-table writes · write `HD_TICKET_HISTORY` on ticket mutations · use migrations, never hand-edit the schema · handle loading/empty/error states in the UI · keep pagination/filtering/sorting consistent across list endpoints.

---

## 12. Definition of done

A module is complete only when it has: UI, API, database (with migration), validation, authorization (where applicable), error handling, loading/empty/error states, pagination/filtering (where applicable), tests, and documentation — as applicable to that specific feature.

---

## 13. Implementation status

**Backend (`server/`) — implemented, frontend intentionally on hold:**

- Layered structure: `routes → controllers → services → repositories`, plus `config/`, `constants/`, `middleware/`, `models/` (column definitions per table), `schemas/` (Joi validation), `utils/`, `database/` (migrations + seed), `integrations/gmail/`.
- SQLite via `better-sqlite3`, 25 migrations covering the Login & Security tables and the Tickets/Contacts/Accounts/Agents/Organization core Phase 1 needs (`HD_ORGANIZATION_MASTER` through `HD_AUTH_LOGIN_EVENT`) — see each file in `server/src/database/migrations/` for the exact column-level source it was built from.
- `npm run seed` bootstraps the single tenant org, default department, system actor, Email channel, and the `HD_MAIL_REPLY_ADDRESS` row for `tasks@sunoida.com`.
- Working REST API (verified end-to-end) for tickets (list/create/update/queues/history/resolution/metrics), conversations, internal comments, contacts, accounts, agents, departments, teams.
- Gmail ingestion engine (`integrations/gmail/`): OAuth client, message normalizer, and an idempotent fetch → normalize → match/create contact → match/create ticket → save conversation/thread pipeline, exposed via `/api/v1/gmail/auth-url`, `/oauth2callback`, `/sync`.
- JWT auth/authorization middleware (`auth.middleware.js`, `authorize.middleware.js`) and `config/auth.js` are scaffolded and ready, but **not wired into any route** — the Login & Security module (`/api/v1/auth/*`) itself isn't built yet, so writes currently attribute to a system actor.

**Not started:** frontend integration (client is scaffolded with Vite/React/Tailwind but untouched beyond that), the Login & Security API, and everything in Phase 2.

**Next steps:**

1. Implement `/api/v1/auth/*` (Login & Security module) and wire `auth.middleware.js`/`authorize.middleware.js` into the write routes.
2. Set up the real Google Cloud OAuth client per [`docs/development/gmail-console-setup.md`](docs/development/gmail-console-setup.md) and run a live ingestion pass against `tasks@sunoida.com`.
3. Add a scheduled job to call `/api/v1/gmail/sync` periodically instead of the current manual trigger.
4. Reconcile the two competing phase orders (Task Breakdown vs. the module reference's 6-phase plan) before starting frontend integration.
