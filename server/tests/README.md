# Server tests

Automated tests for the Vision Support Desk server, run with Node's built-in test runner (`node:test`). No extra test libraries.

## Run

From `server/` (or the repo root with `-w server`):

```bash
npm test
```

| Command | Runs |
|---|---|
| `npm test` | Every test |
| `npm run test:unit` | `tests/unit` only (pure logic, no database) |
| `npm run test:integration` | `tests/integration` only (database + API) |

To run one file, use `node --test --test-reporter=spec tests/integration/tickets.test.js`. For more log output, set `TEST_LOG_LEVEL=info`.

## Safe by design

- `tests/helpers/env.js` sets every environment variable itself, overriding `server/.env`. A test run never uses the live database, mailbox or attachment folder, and it runs the same on a machine with no `.env`.
- Each test file runs in its own process with its **own fresh database** in a temp folder: all migrations plus the normal seed. The folder is removed when the file finishes.
- There are no calls to Google. Gmail tests feed hand-built messages to the ingestion code.

## Layout

```
tests/
├── helpers/
│   ├── env.js        test environment (require it FIRST in every test file)
│   ├── db.js         setupDatabase(): migrate + seed a fresh database
│   ├── fixtures.js   agentWithRole, signIn (token), createContact, createTicket, ...
│   └── api.js        startApi(): the real Express app on a free port
├── unit/             pure functions (business calendar, tracking maths)
└── integration/      services and HTTP API against a real SQLite database
```

## Writing a test

```js
require("../helpers/env");            // always first
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupDatabase } = require("../helpers/db");
const { startApi } = require("../helpers/api");
const { agentWithRole, signIn, createTicket } = require("../helpers/fixtures");

let api;
before(async () => { setupDatabase(); api = await startApi(); });
after(() => api.close());

test("a team member cannot delete a ticket", async () => {
    const ticket = createTicket();
    const res = await api.delete(`/api/v1/tickets/${ticket.Ticket_Id}`, signIn(agentWithRole("TEAM_MEMBER")));
    assert.equal(res.status, 403);
});
```

- Name files `<area>.test.js`.
- Write each test name as a plain-English statement of the rule.
- Fix dates explicitly. Never assert on today's real date.
- If a test finds a real product bug, keep the assertion and mark it `test("...", { todo: "BUG: ..." }, fn)` until the bug is fixed. A todo test is reported but doesn't fail the run.
