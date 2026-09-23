# Doubts & Clarifications Needed

Open questions about how Vision Support Desk's workflow is *supposed* to
work, surfaced while building the ticketing/Gmail-ingestion pieces. Nothing
here blocks what's already built - these are about features and business
rules that don't have an agreed answer yet, so implementing them now would
mean guessing. Answers here should turn directly into follow-up build tasks.

---

## 1. Single shared mailbox vs. individual agent assignment

Right now every ticket is ingested from **one shared mailbox**
(`GMAIL_MAILBOX` in `.env` - currently a personal test address, will become
`tasks@sunoida.com` or similar in production). All inbound mail lands in
that one inbox; all outbound replies (when sent) would also go out *from*
that one address.

- When an agent (e.g. an Agent record assigned via the ticket's **Assignee**
  field) is assigned a ticket, what should actually happen?
  - Does the mail **forward** to that agent's personal inbox so they see it
    in their own Gmail?
  - Or does the agent only ever work **inside this portal** (reading/
    replying to the conversation thread here), never touching Gmail
    directly?
  - If it's portal-only: replying currently has no real "send email"
    feature at all (`POST /tickets/:id/conversations` only writes a local
    DB row - see `server/src/services/conversation.service.js`). Is
    building real outbound sending (via the Gmail API, from the shared
    mailbox, on the agent's behalf) the next priority?
- If an agent replies **directly in Gmail** instead of through the portal
  (like the `sivasriram.balasubramaniyan@sunoida.com` test account did this
  session - see the outbound-ingestion work), that only works because
  they're signed into the *same* shared mailbox. A real assigned agent with
  their own separate mailbox has no way to reply "as" `tasks@sunoida.com`
  unless they're specifically given send-as access in Gmail, or the portal
  gains real send capability. Which model is intended?

## 2. Client-side visibility & approval

- Does the **customer** (the person who emailed in) ever see anything
  beyond their own email inbox - i.e. is a customer-facing portal/help
  center planned, or is email the only channel they ever interact through?
- When a ticket is resolved, how does the customer "approve" it?
  - Purely by replying to the email (in which case: does *any* reply from
    them automatically reopen the ticket, or do agents watch for a specific
    "looks good" type reply)?
  - Or is there a formal approve/reject action expected (a button, a
    survey link, a customer-happiness score - `HD_CUSTOMER_HAPPINESS`
    already exists in the schema but nothing populates it yet)?
- Right now, **every** status change (Open → On Hold → Closed, etc.) is
  100% manual - an agent has to open the ticket and change it themselves.
  Is that the intended long-term behavior, or should some transitions be
  automatic (e.g. auto-close after N days of no reply, auto-move to
  "Waiting on Customer" when an agent replies)?

## 3. Reopen behavior

- What actually **counts** as "reopened"? Candidates:
  - A new inbound email arrives on a `Closed` ticket (ingestion currently
    just adds the message and leaves the status untouched - a closed
    ticket stays closed even after the customer writes back).
  - An agent manually flips the status back to `Open`.
- `HD_TICKET_METRICS.Reopen_Count` already exists as a column but nothing
  increments it anywhere. Should ingestion auto-reopen a ticket (and bump
  this counter) the moment a `Closed` ticket gets a new inbound message?
  That seems like the most natural definition, but it's a real behavior
  change (a customer's "thanks!" reply would reopen a resolved ticket)
  worth confirming before building.

## 4. Agent-level (team member) access & visibility

There's currently **no access control** at all - every agent who opens the
app sees every ticket, with no filtering by department/team/ownership (no
login even exists yet; every write attributes to a system actor). Before
building real auth:

- What should a regular **team member** see by default: only tickets
  assigned to them? Their team's queue? Their department's queue? Everything
  (like now)?
- Are there meant to be distinct **roles** with different access (e.g. the
  agent roles already imported from the Zoho backup - "Deputy Director -
  Support", "Manager", "LightAgent", etc. - `HD_ROLE_MASTER` exists and is
  populated, but nothing in the app reads `Role_Id` to restrict anything
  yet)?
- Can an agent see/edit tickets outside their own department or team, or
  is that meant to be locked down per-department the way `Role_Id`/
  `Data_Sharing_Rule` on `HD_ROLE_MASTER` imply?

## 5. Resolution time / SLA calculation

This is the big one, and it's what the companion priority/SLA-config work
(see the code-change task tracked alongside this doc) partially answers -
but a few pieces still need a decision:

- **When does the SLA clock start?** Options:
  - From `Created_Time` (when the ticket/email first came in) - this is
    what's being implemented (see below), since it's the standard SLA
    definition ("respond within X of the customer's request", not "within
    X of whenever someone got around to triaging it").
  - From whenever an agent first picks it up / assigns a priority.
  - Confirm this assumption is correct before relying on it.
- **Does the clock pause?** If a ticket goes `On Hold` (e.g. waiting on the
  customer for more info), should the SLA countdown pause and resume later,
  or keep running regardless of status? Right now the plan is "keep
  running" (simplest, matches what's being built first) - pausing needs an
  explicit accumulated-hold-time calculation, which is a bigger feature.
- **Business hours vs. calendar time?** Is a "24 hour" SLA actually 24
  calendar hours, or 24 *business* hours (skipping nights/weekends per
  `HD_BUSINESS_HOURS_MASTER`, which is documented in the original schema
  design but not implemented)? The first version assumes calendar time.
- **What happens on SLA breach?** Nothing automatic is planned yet (no
  escalation, no notification) - is that acceptable for now, or is a
  breach supposed to trigger something (flag the ticket, notify a manager,
  auto-bump priority)?
- Separately: **First Response Time**, **Total Response Time**, and
  **Resolution Time** all already exist as columns on `HD_TICKET_METRICS`,
  but nothing calculates or writes them. Once the above questions are
  answered, populating these becomes the natural next step.

---

*Each answered section above should become its own scoped task rather than
being guessed at - several of these (real email sending, auth/RBAC, SLA
business-hours support, customer-facing approval) are substantial features
in their own right, not quick follow-ups.*
