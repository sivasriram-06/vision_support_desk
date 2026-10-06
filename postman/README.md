# Vision Support Desk: Postman collection

`Vision-Support-Desk.postman_collection.json` has **every `/api/v1` endpoint** of the server: 98 requests in 14 folders.

- **Requests marked `[NEW]`** were added after the first version of this collection (24 Sep).
- **The token and ids are saved for you.** Login stores the JWT, and the list and create requests store the ids that later requests use. You don't copy anything by hand.
- **It matches the server as of 6 Oct 2026.** The whole collection was run top to bottom against a fresh server, and every request answered as expected.

---

## 1. Before you start

1. The server is running: `npm run dev` from the repo root. The API is at `http://localhost:3456`.
2. You have a sign-in: an email and password for an agent. Admin or Manager is best, because they can call everything.
3. In Postman: **Import → Files →** `postman/Vision-Support-Desk.postman_collection.json`.

## 2. Set the collection variables

Open the collection, then the **Variables** tab. Fill in the **Current value** column. Current values stay on your machine and are not exported.

| Variable | What to put |
|---|---|
| `baseUrl` | `http://localhost:3456`, already set. Change it for another server. |
| `email` | Your sign-in email |
| `password` | Your password. Keep it in **Current value** only and never export or commit it. |
| `tempPassword` | Only for **Set temporary password**: the temporary password to give the test agent |

Everything else (`token`, `ticketId`, `bankId`, …) fills itself in as you run requests.

## 3. How the token works

```
POST /api/v1/auth/login   { "email": "...", "password": "..." }
        │
        ▼
{ "data": { "token": "eyJhbGciOi...", "agent": { "agentId": "...", "permissions": [...], "mustChangePassword": false } } }
        │   Login's Tests script runs:  pm.collectionVariables.set("token", data.token)
        ▼
every other request sends   Authorization: Bearer {{token}}
```

- The collection's **Authorization** tab is set to **Bearer Token = `{{token}}`**. Every request inherits it, so you never paste the token into a request.
- Login (and the Health check and OAuth callback) use **No Auth**, because you don't have a token yet.
- To see the saved token, open the collection **Variables** tab and look at `token`. The Postman Console (View → Show Postman Console) also logs "Token saved".
- **The token lasts `JWT_EXPIRES_IN`**, which is `1d` by default in `server/.env`. When requests start answering **401 "Invalid or expired access token"**, run **Login** again.
- The server reloads your role and permissions from the database on every request. A role change takes effect at once, with no new login needed.

**If you're doing it by hand without the collection:** call Login, copy `data.token`, then on any request set **Authorization → Type: Bearer Token → Token:** the copied value. That is the same as sending the header `Authorization: Bearer <token>`.

## 4. Step by step (first run)

Run the folders in order the first time. Each step saves what the next one needs.

| Step | Folder → request | What it does and saves |
|---|---|---|
| 1 | **0. Health → Health check** | Confirms the server is up. No token needed. |
| 2 | **1. Auth → Login** | Signs you in and saves `{{token}}` and `{{myAgentId}}`. |
| 2a | **1. Auth → Change password** | **Only if** Login returned `mustChangePassword: true`, for example after an admin gave you a temporary password. Until you change it, every other request answers **403 PASSWORD_CHANGE_REQUIRED**. Put your new password in the body, then update the `password` variable. |
| 3 | **1. Auth → Me** | Shows your role and the permission keys the server will check. |
| 4 | **2. Lookups**: run all | Saves `{{departmentId}}`, `{{bankId}}`, `{{agentId}}`, `{{blockerAgentId}}` and `{{contactId}}`. *Create contact* makes a test customer to raise tickets for. |
| 5 | **3. Tickets → List tickets** | Saves the first `{{ticketId}}`. |
| 6 | **3. Tickets → Create ticket** | Makes a new ticket and saves its `{{ticketId}}`. The rest of the folder works on it. |
| 7 | **4. Assignment** → **5. Work tracking** | Assigns the two saved agents, then exercises work states, "waits on", work log and release. |
| 8 | **6. Reply after close** | Needs a **Closed** ticket with a customer reply. See the notes in section 6. |
| 9 | **7. Recycle bin** | Deletes `{{ticketId}}` to the bin, lists the bin, then restores it. |
| 10 | **8 – 12** | Holidays, customers, configuration, agents and admin. **These change real settings.** Read section 7 first. |

You can also run a whole folder with **Run folder** (Collection Runner). The requests are ordered so each one gets the ids it needs.

## 5. Responses and errors

| Kind | Shape |
|---|---|
| Single item | `{ "data": { ... } }` |
| List | `{ "data": [ ... ], "paging": { "limit", "page", "total", "hasMore", "nextCursor" } }` |
| Error | `{ "error": { "code", "message", "details", "traceId" } }`. Quote the `traceId` when reporting a problem; the same id is in `server/logs`. |

| Status | Usually means |
|---|---|
| 400 `VALIDATION_ERROR` | The body or query is wrong. `details` lists each field. |
| 401 `INVALID_TOKEN` | There is no token, or it has expired: run **Login** again. A revoked or inactive sign-in also gets 401. |
| 401 `INVALID_CREDENTIALS` | Wrong email or password at Login. |
| 403 `PASSWORD_CHANGE_REQUIRED` | Run **Change password** first. |
| 403 `ACCOUNT_LOCKED` | Too many wrong passwords. Wait `LOCK_MINUTES`, or ask an admin to reset your password. |
| 403 `FORBIDDEN` | Your role doesn't have the permission. Check **Me**. |
| 404 | The id doesn't exist, or the ticket was deleted. |
| 409 | Duplicate (name, email or date), or a recycle-bin restore after the time ran out (`RESTORE_PERIOD_EXPIRED`). |

## 6. Notes on the business flows

- **The desk never sends email.** **Add reply record** only stores a reply on the ticket. Mail to customers goes out from Gmail, and the sync imports it.
- **First assignment:** only Admin, Manager, Team Lead or Assistant Team Lead can make it. After that, any current assignee can add people from any team.
- **Closing:** a ticket can't move to a status whose clock is *Stopped* (Closed) while any assignee's work is not Done. A Closed ticket can't move back to an open status by update; use **Reopen**.
- **Reply after close:**
  - Find tickets waiting for a decision with **List tickets** and `closeReplies=true`.
  - Put that ticket's id in `{{ticketId}}`, then choose **Reopen**, **Create as new issue** or **No action needed**.
  - On a normal open ticket these answer 400, which is correct.
- **Holiday timer:** works only on a company holiday, for an assignee. On other days it answers 400.
- **Recycle bin:**
  - A deleted ticket can be restored for `RECYCLE_BIN_DAYS` days (30 by default).
  - After that it is permanently deleted within the hour. Restore then answers 409.
- **Ticket subject** is fixed by design. **Update ticket** doesn't send it.

## 7. Requests that change real data

The write requests in **8 – 12** act on the server you point them at. To keep that safe:

- **Configuration** works only on records it creates first, then deletes them. That means priority `{{newPriority}}` (P4), a test status, product, team and bank. It never renames or deletes seeded values.
- **Set SLA hours** re-saves P2 with its default 72 hours. **Set role permissions** re-saves the Team Member role with its default permissions. Change those bodies only on purpose.
- **Agents & sign-in access** creates a test agent (`postman.test.agent@example.com`). It sets and revokes that agent's password, then deletes the agent. No real agent is touched.
- **Holidays → Add holiday** adds 24 Dec 2026, and **Remove holiday** removes it again. Adding a holiday re-dates open tickets, so remove it afterwards if you ran only the add.
- Prefer a test copy of the database for full **Run collection** passes.

## 8. Roles at a glance (default permissions)

| Can do | Admin | Manager | Team Lead | Asst. TL | Member |
|---|:-:|:-:|:-:|:-:|:-:|
| View tickets, reply and comment, change status | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create tickets, edit properties, assign in team, reopen and split | ✓ | ✓ | ✓ | ✓ | |
| Customers | ✓ | ✓ | ✓ | ✓ | |
| Delete and restore tickets (recycle bin), holidays | ✓ | ✓ | ✓ | | |
| Assign anyone, agents, banks and teams, config, Admin, Gmail | ✓ | ✓ | | | |

An Admin can change any role's permissions with **Admin → Set role permissions**, or on the Admin page.

---

## 9. Endpoint reference

`[NEW]` = added after the first collection. Path parameters such as `{{ticketId}}` are filled from the collection variables.

### 0. Health

No sign-in needed. Use it to check the server is up.

| | Method | Path | Request | Notes |
|---|---|---|---|---|
|  | GET | `/health` | **Health check** | Returns `{ data: { status: "ok", timestamp } }`. |

### 1. Auth (start here)

Call **Login** first. Its test script saves the JWT into the `token` collection variable; every other request sends it as `Authorization: Bearer {{token}}` (collection-level auth).

| | Method | Path | Request | Notes |
|---|---|---|---|---|
| **NEW** | POST | `/api/v1/auth/login` | **Login**<br>Body: `{"email":"{{email}}","password":"{{password}}"}` | Email + password. Response `{ data: { token, agent } }`. The token is saved to `{{token}}` automatically and `agent.agentId` to `{{myAgentId}}`. If `agent.mustChangePassword` is true, call **Change password** next - every other route answers 403 PASSWORD_CHANGE_REQUIRED until then. Wrong password/unknown email: 401. After MAX_FAILED_ATTEMPTS wrong passwords: 403 ACCOUNT_LOCKED for LOCK_MINUTES. |
| **NEW** | GET | `/api/v1/auth/me` | **Me** | The signed-in agent: role, team and the permission keys the server will enforce. |
| **NEW** | POST | `/api/v1/auth/change-password` | **Change password**<br>Body: `{"currentPassword":"{{password}}","newPassword":""}` | Required after a temporary password. Policy: at least 8 characters, a letter and a number, max 72 bytes, different from the current one. |
| **NEW** | POST | `/api/v1/auth/logout` | **Logout** | Records a LOGOUT login event and clears the cookie. The token itself stays valid until it expires (JWT_EXPIRES_IN) - discard it on the client. |

### 2. Lookups (ids for later calls)

Run these once after login - each saves the first id it finds into a collection variable used by the ticket requests.

| | Method | Path | Request | Notes |
|---|---|---|---|---|
|  | GET | `/api/v1/departments` | **List teams (departments)** | Support and product teams. Saves the first `Department_Id` to `{{departmentId}}`. |
|  | GET | `/api/v1/departments/{{departmentId}}` | **Get team** |  |
|  | GET | `/api/v1/banks` | **List banks** | Optional `?departmentId=`. Saves the first `Bank_Id` to `{{bankId}}`. |
|  | GET | `/api/v1/banks/{{bankId}}` | **Get bank** | Bank with support team, level, working days, time zone, IST support hours, 24x7 flag and resources. |
|  | GET | `/api/v1/agents ?departmentId` | **List agents** | Optional `?departmentId=`. Saves two active agents: `{{agentId}}` (assignee in the Assignment / Work requests) and `{{blockerAgentId}}` (the second assignee, for 'waits on'). |
|  | GET | `/api/v1/agents/{{agentId}}` | **Get agent** |  |
| **NEW** | GET | `/api/v1/picklists ?field, parentValue` | **List picklist values** | `field` = STATUS \| CLASSIFICATION \| CATEGORY \| SUB_CATEGORY \| TEAM_TYPE. CATEGORY takes `parentValue` (the classification). Statuses include their `Clock_Behaviour`. |
| **NEW** | GET | `/api/v1/products` | **List products** |  |
| **NEW** | GET | `/api/v1/priority-sla` | **List priority SLA hours** | P1 / P2 / P3 and their SLA hours. |
| **NEW** | GET | `/api/v1/escalation-levels` | **List escalation levels** | Per priority: level number and offset hours from the SLA due date (negative = before). |
|  | GET | `/api/v1/contacts ?page, limit, search` | **List contacts** | Every sender (Gmail) and manually created contact. `?search=` on name/email. |
|  | POST | `/api/v1/contacts` | **Create contact**<br>Body: `{"firstName":"Test","lastName":"Customer","email":"test.customer@example.com"}` | Needs tickets.create. Saves `Contact_Id` to `{{contactId}}`. |
|  | GET | `/api/v1/contacts/{{contactId}}` | **Get contact** |  |

### 3. Tickets

All need tickets.view. Create needs tickets.create; status changes tickets.edit_status; other fields tickets.edit_properties; delete tickets.delete.

| | Method | Path | Request | Notes |
|---|---|---|---|---|
|  | GET | `/api/v1/tickets ?page, limit, search, status, priority, state, sortBy, sortOrder` | **List tickets (All Cases)** | Filters (all optional): `status`, `priority`, `departmentId`, `bankId`, `assigneeId`, `contactId`, `state` (open \| closed \| overdue), `search` (subject or ticket number), `slaBreached=true`, `closeReplies=true` (Closed tickets with a customer reply awaiting a lead), `escalationLevel` (any \| 1 \| 2 ...). Sort: `sortBy` (Created_Time, Modified_Time, Response_Due_Date, Priority, Status, Subject), `sortOrder` asc\|desc. Paging: `page`, `limit` (max 100). Saves the first `Ticket_Id` to `{{ticketId}}`. |
|  | POST | `/api/v1/tickets` | **Create ticket**<br>Body: `{"subject":"Login issue on portal","description":"Customer cannot log in.","channel":"Phone","departmentId":"{{departmentId}}","bankId":"{{bankId}}","contactId":"{{contactId}}","priority":"P2"}` | Manual ticket. Channel: Email \| Web Form \| Social \| Chat \| Phone. With a `bankId` the ticket goes to that bank's team. SLA due date comes from the priority on the bank's calendar. Saves `Ticket_Id` to `{{ticketId}}`. |
|  | GET | `/api/v1/tickets/{{ticketId}}` | **Get ticket** | Full ticket with team, bank, contact, SLA due date, clock state, escalation level and counts. |
|  | PATCH | `/api/v1/tickets/{{ticketId}}` | **Update ticket**<br>Body: `{"status":"In Progress","priority":"P1"}` | Send only the fields to change: `status`, `priority`, `departmentId`, `bankId`, `productId`, `classification`, `category`, `subCategory`, `description`. Rules: a bank moves the ticket to the bank's team; priority/bank re-date the SLA; a Closed ticket cannot go back to an open status (use Reopen); closing is refused while any assignee is not Done. The subject is fixed by design - don't send it. |
|  | GET | `/api/v1/tickets/{{ticketId}}/history` | **Ticket history** | Every change: event, field, old and new value, who and when. |
|  | GET | `/api/v1/tickets/{{ticketId}}/metrics` | **Ticket metrics (SLA + resolution clock)** | SLA due date, time left, escalation level, holidays inside the SLA, live resolution time (support hours), reopen count. |
|  | GET | `/api/v1/tickets/{{ticketId}}/conversations` | **List conversations (mails)** | Every mail on the ticket, in and out, oldest first. |
|  | POST | `/api/v1/tickets/{{ticketId}}/conversations` | **Add reply record**<br>Body: `{"content":"We are looking into it.","isPublic":true}` | Stores an outbound reply on the ticket (tickets.reply). It is NOT emailed - customer mail goes out from Gmail and is imported. |
|  | GET | `/api/v1/tickets/{{ticketId}}/comments` | **List internal comments** |  |
|  | POST | `/api/v1/tickets/{{ticketId}}/comments` | **Add internal comment**<br>Body: `{"content":"Checked logs - waiting for Java team.","assignmentId":null}` | Never mailed. Optional `assignmentId` ties it to one assignee's work. |
| **NEW** | GET | `/api/v1/tickets/{{ticketId}}/attachments` | **List attachments** | Saves the first `Attachment_Id` to `{{attachmentId}}`. |
| **NEW** | GET | `/api/v1/tickets/{{ticketId}}/attachments/{{attachmentId}}/download` | **Download attachment** | Returns the file (Send and Download in Postman). |
|  | GET | `/api/v1/tickets/queues/agent/{{agentId}}` | **Agent queue** | Open tickets assigned to an agent. |
|  | GET | `/api/v1/tickets/queues/bank/{{bankId}}` | **Bank queue** | Open tickets of one bank (board view). |
| **NEW** | GET | `/api/v1/tickets/queues/escalated ?departmentId, bankId, priority` | **Escalated tickets** | Open tickets at escalation level 1 or higher. Optional `departmentId`, `bankId`, `priority`. |

### 4. Assignment & My Tickets

The first assignment of a ticket: Admin, Manager, Team Lead or Assistant Team Lead only. After that, current assignees can add others from any team (cross-team).

| | Method | Path | Request | Notes |
|---|---|---|---|---|
| **NEW** | GET | `/api/v1/tickets/{{ticketId}}/assignees` | **List assignees** | Current and released assignments with work state, who assigned, when, cross-team flag. |
| **NEW** | POST | `/api/v1/tickets/{{ticketId}}/assignees` | **Assign agents**<br>Body: `{"agentIds":["{{agentId}}","{{blockerAgentId}}"],"note":"Please check the portal login."}` | `agentIds`: one or more agents (here the two saved by List agents). Optional `note`. |
| **NEW** | POST | `/api/v1/tickets/{{ticketId}}/assignees/seen` | **Mark ticket seen** | Clears the 'new assignment' badge for the signed-in agent. |
| **NEW** | GET | `/api/v1/tickets/my ?scope, includeClosed` | **My tickets** | `scope` = assigned (to me) \| assignedBy (me) \| team (leads). `includeClosed=true` to include closed. |
| **NEW** | GET | `/api/v1/tickets/my/counts ?includeClosed` | **My tickets counts** | Counts per tab plus `unseen` (new assignments not opened yet). |

### 5. Work tracking

Per-assignee work. The assignee, whoever assigned them, Admin/Manager and the team leads may change it.

| | Method | Path | Request | Notes |
|---|---|---|---|---|
| **NEW** | GET | `/api/v1/tickets/{{ticketId}}/tracking` | **Tracking (timeline + totals)** | Per assignee and per team: time held, active, waiting and logged; swimlanes; timeline of every event; longest wait; critical path. |
| **NEW** | PATCH | `/api/v1/tickets/{{ticketId}}/assignees/{{agentId}}/state` | **Change work state**<br>Body: `{"state":"IN_PROGRESS","note":""}` | `state` = IN_PROGRESS \| ON_HOLD \| DONE. (PENDING / WAITING / READY are set by the system.) |
| **NEW** | POST | `/api/v1/tickets/{{ticketId}}/assignees/{{agentId}}/dependencies` | **Add 'waits on'**<br>Body: `{"blockerAgentId":"{{blockerAgentId}}"}` | `{{agentId}}` waits on `blockerAgentId`: becomes WAITING, then READY automatically when the blocker is Done or released. Loops are refused. |
| **NEW** | DELETE | `/api/v1/tickets/{{ticketId}}/assignees/{{agentId}}/dependencies/{{blockerAgentId}}` | **Remove 'waits on'** |  |
| **NEW** | POST | `/api/v1/tickets/{{ticketId}}/assignees/{{agentId}}/worklogs` | **Log work**<br>Body: `{"minutes":30,"note":"Analysed the logs"}` | `minutes` 1-1440, optional `note`. Saves the new `Worklog_Id` to `{{worklogId}}`. |
| **NEW** | DELETE | `/api/v1/tickets/{{ticketId}}/worklogs/{{worklogId}}` | **Delete work log** | Only the person who logged it. |
| **NEW** | DELETE | `/api/v1/tickets/{{ticketId}}/assignees/{{blockerAgentId}}` | **Remove / release assignee** | Ends one person's assignment. Allowed for the assignee themselves, whoever assigned them, Admin/Manager, or a lead of the ticket's team or of the assignee's team. |

### 6. Reply after close (reopen / new issue / no action)

When a customer mails on a Closed ticket, the mail is held (`Post_Close_Decision = PENDING`) and a lead with tickets.reopen decides. Find them with List tickets `?closeReplies=true` and put that id in `{{ticketId}}`. On an open ticket these answer 400 (reopen needs a Closed ticket; split / dismiss need a pending reply).

| | Method | Path | Request | Notes |
|---|---|---|---|---|
| **NEW** | GET | `/api/v1/tickets/{{ticketId}}/reopens` | **Reopen info** | Pending replies after close, reopen rounds (number, reason, who, previous close/due date, SLA met) and split links. |
| **NEW** | POST | `/api/v1/tickets/{{ticketId}}/reopen` | **Reopen**<br>Body: `{"reason":"Customer says the error is back"}` | Needs a `reason` (3-500 chars). The SLA starts fresh from now, all assignees are released, status goes back to Unassigned, reopen count +1. Works without a pending mail too (manual reopen). |
| **NEW** | POST | `/api/v1/tickets/{{ticketId}}/split` | **Create as new issue** | No body. Creates a new linked ticket from the pending mail (properties copied - edit with Update ticket afterwards). Later replies to the old mail follow the new ticket. The old ticket stays Closed. |
| **NEW** | POST | `/api/v1/tickets/{{ticketId}}/close-replies/dismiss` | **No action needed** | Marks the pending mails as no action (e.g. a thank-you). Ticket stays Closed. |

### 7. Recycle bin

Admin, Manager, Team Lead (tickets.delete). Deleted tickets can be restored for RECYCLE_BIN_DAYS (server .env, default 30); after that an hourly job deletes them permanently.

| | Method | Path | Request | Notes |
|---|---|---|---|---|
| **NEW** | DELETE | `/api/v1/tickets/{{ticketId}}` | **Delete ticket (to recycle bin)** | Admin, Manager, Team Lead (tickets.delete). The ticket leaves every list and goes to the Recycle Bin, restorable for RECYCLE_BIN_DAYS. |
| **NEW** | GET | `/api/v1/tickets/recycle-bin` | **List recycle bin** | `{ retentionDays, tickets: [...] }` - each with Deleted_Time, Deleted_By_Name, Purge_Time, Days_Left. Saves the first ticket to `{{deletedTicketId}}`. |
| **NEW** | POST | `/api/v1/tickets/{{deletedTicketId}}/restore` | **Restore ticket** | Back on every list as it was. 404 if it is not in the bin; 409 RESTORE_PERIOD_EXPIRED after the window. |

### 8. Holidays & holiday timer

Company holidays are skipped by the SLA, escalations and resolution time. Calendar endpoints need holidays.manage (Admin, Manager, Team Lead).

| | Method | Path | Request | Notes |
|---|---|---|---|---|
| **NEW** | GET | `/api/v1/holidays ?year` | **List holidays** | Optional `year`. Also returns the `applyTo24x7` setting. |
| **NEW** | GET | `/api/v1/holidays/impact ?date, remove` | **Preview impact** | Which open tickets would be re-dated if `date` became a holiday (or `remove=true` stopped being one). |
| **NEW** | POST | `/api/v1/holidays` | **Add holiday**<br>Body: `{"holidayDate":"2026-12-24","holidayName":"Christmas Eve"}` | Re-dates open tickets and recomputes closed resolution times. |
| **NEW** | PATCH | `/api/v1/holidays/{{holidayId}}` | **Edit holiday**<br>Body: `{"holidayName":"Christmas Eve (half day)"}` |  |
| **NEW** | DELETE | `/api/v1/holidays/{{holidayId}}` | **Remove holiday** |  |
| **NEW** | PUT | `/api/v1/holidays/settings` | **Holidays for 24x7 banks**<br>Body: `{"applyTo24x7":false}` | `applyTo24x7`: do 24x7 banks also skip holidays? Default false. |
| **NEW** | POST | `/api/v1/tickets/{{ticketId}}/holiday-timer/start` | **Start holiday timer** | Work done on a company holiday - counts in resolution time only, never the SLA. Assignee only, and only ON a holiday (other days answer 400); stops automatically at midnight IST. |
| **NEW** | POST | `/api/v1/tickets/{{ticketId}}/holiday-timer/stop` | **Stop holiday timer** |  |

### 9. Customers

Gmail senders. Admin, Manager, Team Lead, Assistant Team Lead (customers.manage).

| | Method | Path | Request | Notes |
|---|---|---|---|---|
| **NEW** | GET | `/api/v1/customers ?page, limit, search, bankId` | **List customers** | `search` (name/email), `letter` (A-Z or #), `bankId` (or `none`), paging. Each with All / Open / Closed / Overdue counts. Saves the first to `{{contactId}}`. |
| **NEW** | GET | `/api/v1/customers/{{contactId}}` | **Get customer** | Name, email, bank and ticket counts. Their tickets: List tickets with `contactId` (+ `state`). |
|  | GET | `/api/v1/tickets ?contactId, state` | **Customer's tickets** | Same `state` buckets as the counts: open \| closed \| overdue (leave out for all). |
| **NEW** | PATCH | `/api/v1/customers/{{contactId}}` | **Update customer**<br>Body: `{"name":"Ravi Kumar","bankId":"{{bankId}}"}` | Name and bank only (email is how Gmail matches them). |

### 10. Configuration

Reads are open to every signed-in agent. Writes: config.manage (priorities, escalation levels, picklists, products) or teams.manage (banks, teams). **These change real settings.** Each write here works on a record the folder creates first (priority {{newPriority}}, a test status, product, bank and team), then deletes it - nothing seeded is renamed or removed.

| | Method | Path | Request | Notes |
|---|---|---|---|---|
| **NEW** | PUT | `/api/v1/priority-sla/{{priority}}` | **Set SLA hours for a priority**<br>Body: `{"slaHours":72}` | Re-saves `{{priority}}` (P2) with its default 72 hours. Change the number only on purpose - it is the live SLA. |
| **NEW** | POST | `/api/v1/priority-sla` | **Add priority**<br>Body: `{"priority":"{{newPriority}}","slaHours":480}` |  |
| **NEW** | POST | `/api/v1/escalation-levels` | **Add escalation level**<br>Body: `{"priority":"{{newPriority}}","levelNo":1,"offsetHours":-24}` | Offsets must increase with the level. Rebuilds open tickets' triggers. Saves `{{escalationLevelId}}`. |
| **NEW** | PATCH | `/api/v1/escalation-levels/{{escalationLevelId}}` | **Edit escalation level**<br>Body: `{"offsetHours":-12}` |  |
| **NEW** | DELETE | `/api/v1/escalation-levels/{{escalationLevelId}}` | **Delete escalation level** |  |
| **NEW** | DELETE | `/api/v1/priority-sla/{{newPriority}}` | **Delete priority** |  |
| **NEW** | POST | `/api/v1/picklists` | **Add picklist value**<br>Body: `{"field":"STATUS","value":"Postman Test Status","clockBehaviour":"PAUSED"}` | STATUS takes `clockBehaviour` (NOT_STARTED \| RUNNING \| PAUSED \| STOPPED); CATEGORY needs `parentValue` (its classification). Saves `{{picklistValueId}}`. |
| **NEW** | PATCH | `/api/v1/picklists/{{picklistValueId}}` | **Edit picklist value**<br>Body: `{"value":"Postman Test Status 2","clockBehaviour":"RUNNING"}` | Renaming a status moves its tickets to the new name; changing its clock behaviour applies to tickets in it. |
| **NEW** | DELETE | `/api/v1/picklists/{{picklistValueId}}` | **Delete picklist value** |  |
| **NEW** | POST | `/api/v1/products` | **Add product**<br>Body: `{"productName":"Postman Test Product","description":"","departmentId":null}` | Saves `{{productId}}`. |
| **NEW** | GET | `/api/v1/products/{{productId}}` | **Get product** |  |
| **NEW** | PATCH | `/api/v1/products/{{productId}}` | **Edit product**<br>Body: `{"productName":"Postman Test Product 2"}` |  |
| **NEW** | DELETE | `/api/v1/products/{{productId}}` | **Delete product** |  |
| **NEW** | POST | `/api/v1/departments` | **Add team**<br>Body: `{"departmentName":"Postman Test Team","teamType":"Support"}` | Saves `{{newDepartmentId}}`. |
| **NEW** | PATCH | `/api/v1/departments/{{newDepartmentId}}` | **Edit team**<br>Body: `{"departmentName":"Postman Test Team 2","teamType":"Support"}` |  |
| **NEW** | POST | `/api/v1/banks` | **Add bank**<br>Body: `{"bankName":"Postman Test Bank","departmentId":"{{newDepartmentId}}","country":"India","supportLevel":"Gold","workingDays":["MON","TUE","WED","THU","FRI"],"timeZone":"Asia/Kolkata","supportStartIst":"10:30","supportEndIst":"19:30","is24x7":false,"primaryResourceIds":[],"secondaryResourceIds":[]}` | Support hours are IST HH:mm. Working days MON..SUN. Saves `{{newBankId}}`. |
| **NEW** | PATCH | `/api/v1/banks/{{newBankId}}` | **Edit bank**<br>Body: `{"workingDays":["MON","TUE","WED","THU","FRI","SAT"]}` | Changing the calendar re-dates its open tickets. |
| **NEW** | DELETE | `/api/v1/banks/{{newBankId}}` | **Delete bank** | Soft delete. |
| **NEW** | DELETE | `/api/v1/departments/{{newDepartmentId}}` | **Delete team** |  |

### 11. Agents & sign-in access

Reads: any signed-in agent. Writes: agents.manage; role changes and passwords also need admin.access. The folder creates a test agent (`{{newAgentId}}`), works on it and deletes it - no real agent is touched.

| | Method | Path | Request | Notes |
|---|---|---|---|---|
| **NEW** | POST | `/api/v1/agents` | **Create agent**<br>Body: `{"firstName":"Postman","lastName":"Test Agent","email":"postman.test.agent@example.com","departmentId":"{{departmentId}}"}` | Optional `roleId` (from Admin > List roles). No sign-in is created - set a temporary password next. Saves `{{newAgentId}}`. |
| **NEW** | PATCH | `/api/v1/agents/{{newAgentId}}` | **Update agent**<br>Body: `{"lastName":"Test Agent (edited)","status":"Active"}` | `status: Inactive` blocks sign-in and closes their sessions. |
| **NEW** | PUT | `/api/v1/admin/users/{{newAgentId}}/password` | **Set temporary password**<br>Body: `{"password":"{{tempPassword}}"}` | admin.access. The agent must change it at first sign-in. Also clears a lockout. Put the value in `{{tempPassword}}`. |
| **NEW** | DELETE | `/api/v1/admin/users/{{newAgentId}}/password` | **Revoke sign-in** | admin.access. Removes the agent's sign-in; existing tokens stop working. |
| **NEW** | DELETE | `/api/v1/agents/{{newAgentId}}` | **Delete agent** | Soft delete; sign-in revoked. |

### 12. Admin

admin.access (Admin, Manager by default).

| | Method | Path | Request | Notes |
|---|---|---|---|---|
| **NEW** | GET | `/api/v1/admin/roles` | **List roles** | With their permission keys. Saves the Team Member role's id to `{{roleId}}`. |
| **NEW** | GET | `/api/v1/admin/permissions` | **Permission catalogue** | Every permission key with label and description. |
| **NEW** | PUT | `/api/v1/admin/roles/{{roleId}}/permissions` | **Set role permissions**<br>Body: `{"permissions":["tickets.view","tickets.reply","tickets.edit_status"]}` | Replaces the role's whole permission list (takes effect on the next request; the Admin role is locked). The body is the Team Member default - change it only on purpose. |
| **NEW** | GET | `/api/v1/admin/users` | **User access list** | Agents with sign-in state: has password, must change, locked, last login. |
| **NEW** | GET | `/api/v1/admin/login-events` | **Login activity** | Latest sign-ins, failures (with reason) and logouts. |
| **NEW** | GET | `/api/v1/admin/mail-integration` | **Mail integration status** | Mailbox, connected, sync interval. Never returns secrets. |

### 13. Gmail integration

Admin only (admin.access) except the OAuth callback, which Google calls.

| | Method | Path | Request | Notes |
|---|---|---|---|---|
|  | GET | `/api/v1/gmail/auth-url` | **1. Get auth URL** | Open the returned URL in a browser and sign in as GMAIL_MAILBOX. |
|  | GET | `/api/v1/gmail/oauth2callback ?code` | **2. OAuth callback** | Google redirects here. Shows the refresh_token to put in server/.env as GOOGLE_REFRESH_TOKEN. |
|  | POST | `/api/v1/gmail/sync` | **3. Run sync now** | Imports new mail now (the background job does this every GMAIL_SYNC_INTERVAL_MS). |
| **NEW** | POST | `/api/v1/gmail/sync-deletions` | **4. Run deletion sync now** | Hides mail deleted in Gmail and restores mail taken back out of Trash. |

---

After changing routes, update this collection from `server/src/routes/v1` and run every folder once against a test database.
