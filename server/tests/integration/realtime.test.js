require("../helpers/env");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { setupDatabase, getDB } = require("../helpers/db");
const { agentWithRole, signIn, supportTeam, bankOf, createTicket, systemAgentId } = require("../helpers/fixtures");
const app = require("../../src/app");
const { bus, REALTIME_EVENT } = require("../../src/realtime/bus");
const { attachWebSocketHub } = require("../../src/realtime/ws-hub");
const ticketService = require("../../src/services/ticket.service");
const assignmentService = require("../../src/services/ticket-assignment.service");
const recycleBinService = require("../../src/services/recycle-bin.service");
const authService = require("../../src/services/auth.service");

// Keys an event may carry: ids and labels only, never ticket data.
const ALLOWED_KEYS = new Set(["type", "ticketId", "ticketIds", "reason", "actorAgentId", "at", "inbound"]);

/** Collects bus events; `visible` records whether the ticket row was committed when the event fired. */
const record = () => {
    const events = [];
    const listener = (event, targets) => {
        const row = event.ticketId
            ? getDB().prepare("SELECT Is_Deleted FROM HD_TICKET_MASTER WHERE Ticket_Id = ?").get(event.ticketId)
            : null;
        events.push({ event, targets, row });
    };
    bus.on("event", listener);
    return { events, stop: () => bus.off("event", listener) };
};
const flush = () => new Promise((resolve) => setImmediate(() => setImmediate(resolve)));

const assertIdsOnly = (events) => {
    for (const { event } of events) {
        for (const key of Object.keys(event)) assert.ok(ALLOWED_KEYS.has(key), `event ${event.type} carries "${key}"`);
    }
};

before(() => {
    setupDatabase();
});

test("creating a ticket publishes ticket.created after the commit, with ids only", async () => {
    await flush(); // drop events from the setup above
    const rec = record();
    try {
        const ticket = createTicket({ subject: "Secret subject" });
        assert.equal(rec.events.length, 0, "nothing is delivered synchronously inside the call");
        await flush();
        const created = rec.events.filter(({ event }) => event.type === REALTIME_EVENT.TICKET_CREATED);
        assert.equal(created.length, 1);
        assert.equal(created[0].event.ticketId, ticket.Ticket_Id);
        assert.equal(created[0].targets, null, "broadcast to every signed-in agent");
        assert.equal(created[0].row.Is_Deleted, "N", "row committed before the event fired");
        assert.ok(!JSON.stringify(rec.events).includes("Secret subject"));
        assertIdsOnly(rec.events);
    } finally {
        rec.stop();
    }
});

test("updating a ticket publishes ticket.changed naming the changed fields", async () => {
    const ticket = createTicket();
    const actor = systemAgentId();
    await flush(); // drop events from the setup above
    const rec = record();
    try {
        ticketService.updateTicket(ticket.Ticket_Id, { priority: "P1", subject: "New secret" }, actor);
        assert.equal(rec.events.length, 0);
        await flush();
        const changed = rec.events.find(({ event }) => event.type === REALTIME_EVENT.TICKET_CHANGED);
        assert.ok(changed);
        assert.equal(changed.event.ticketId, ticket.Ticket_Id);
        assert.equal(changed.event.actorAgentId, actor);
        assert.match(changed.event.reason, /Priority/);
        assert.match(changed.event.reason, /Response_Due_Date/);
        assert.ok(!JSON.stringify(rec.events).includes("New secret"));
        assertIdsOnly(rec.events);
    } finally {
        rec.stop();
    }
});

test("an update that changes nothing publishes nothing", async () => {
    const ticket = createTicket({ priority: "P2" });
    await flush(); // drop events from the setup above
    const rec = record();
    try {
        ticketService.updateTicket(ticket.Ticket_Id, { priority: "P2" }, systemAgentId());
        await flush();
        assert.equal(rec.events.length, 0);
    } finally {
        rec.stop();
    }
});

test("assigning publishes ticket.assignment to all and my-tickets.changed to the people involved", async () => {
    const team = supportTeam();
    const lead = agentWithRole("TEAM_LEAD", { departmentId: team.Department_Id });
    const member = agentWithRole("TEAM_MEMBER", { departmentId: team.Department_Id });
    const ticket = createTicket({ departmentId: team.Department_Id, bankId: bankOf(team.Department_Id).Bank_Id, status: "Unassigned" });
    const actor = authService.buildPrincipal(lead.Agent_Id);
    await flush(); // drop events from the setup above
    const rec = record();
    try {
        assignmentService.addAssignees(ticket.Ticket_Id, [member.Agent_Id], actor);
        assert.equal(rec.events.length, 0);
        await flush();
        const types = rec.events.map(({ event }) => event.type);
        assert.ok(types.includes(REALTIME_EVENT.TICKET_ASSIGNMENT));
        // First assignee moves an Unassigned ticket to Open.
        assert.ok(types.includes(REALTIME_EVENT.TICKET_CHANGED));
        const mine = rec.events.find(({ event }) => event.type === REALTIME_EVENT.MY_TICKETS_CHANGED);
        assert.ok(mine);
        assert.equal(mine.event.ticketId, ticket.Ticket_Id);
        assert.ok(mine.targets.includes(member.Agent_Id), "the assignee");
        assert.ok(mine.targets.includes(lead.Agent_Id), "the assigner");
        assert.equal(new Set(mine.targets).size, mine.targets.length, "no duplicate targets");
        assertIdsOnly(rec.events);
    } finally {
        rec.stop();
    }
});

test("deleting publishes ticket.deleted; restoring publishes ticket.created with reason restored", async () => {
    const ticket = createTicket();
    const actor = agentWithRole("ADMIN").Agent_Id;
    await flush(); // drop events from the setup above
    const rec = record();
    try {
        ticketService.deleteTicket(ticket.Ticket_Id, actor);
        assert.equal(rec.events.length, 0);
        await flush();
        const deleted = rec.events.find(({ event }) => event.type === REALTIME_EVENT.TICKET_DELETED);
        assert.ok(deleted);
        assert.equal(deleted.event.ticketId, ticket.Ticket_Id);
        assert.equal(deleted.row.Is_Deleted, "Y", "soft delete committed before the event");

        rec.events.length = 0;
        recycleBinService.restoreTicket(ticket.Ticket_Id, actor);
        assert.equal(rec.events.length, 0);
        await flush();
        const restored = rec.events.find(({ event }) => event.type === REALTIME_EVENT.TICKET_CREATED);
        assert.ok(restored);
        assert.equal(restored.event.reason, "restored");
        assert.equal(restored.row.Is_Deleted, "N");
        assertIdsOnly(rec.events);
    } finally {
        rec.stop();
    }
});

test("a failed update publishes nothing", async () => {
    const ticket = createTicket();
    ticketService.updateTicket(ticket.Ticket_Id, { status: "Closed" }, systemAgentId());
    await flush(); // drop events from the setup above
    const rec = record();
    try {
        assert.throws(() => ticketService.updateTicket(ticket.Ticket_Id, { status: "In Progress" }, systemAgentId()));
        await flush();
        assert.equal(rec.events.length, 0);
    } finally {
        rec.stop();
    }
});

// ---------------------------------------------------------------- WebSocket hub

const openHub = () => new Promise((resolve) => {
    const server = http.createServer(app);
    const wss = attachWebSocketHub(server);
    server.listen(0, "127.0.0.1", () => resolve({
        url: `ws://127.0.0.1:${server.address().port}/ws`,
        close: () => new Promise((done) => {
            for (const client of wss.clients) client.terminate();
            wss.close(() => server.close(done));
        })
    }));
});

/** Connects, sends `firstMessage`, and resolves with the messages received until `until` matches or the socket closes. */
const connect = (url, firstMessage, until) => new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages = [];
    const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`timed out; got ${JSON.stringify(messages)}`));
    }, 4000);
    ws.addEventListener("open", () => ws.send(JSON.stringify(firstMessage)));
    ws.addEventListener("message", (e) => {
        const message = JSON.parse(e.data);
        messages.push(message);
        if (until && until(message, ws)) {
            clearTimeout(timer);
            resolve({ ws, messages });
        }
    });
    ws.addEventListener("close", (e) => {
        clearTimeout(timer);
        resolve({ ws, messages, closeCode: e.code });
    });
    ws.addEventListener("error", () => {});
});

test("WebSocket hub: a valid first-message JWT gets ready and then live events; a bad token is closed with 4001", async () => {
    const hub = await openHub();
    try {
        const token = signIn(agentWithRole("TEAM_MEMBER"));
        let createdId = null;
        const result = await connect(hub.url, { type: "auth", token }, (message) => {
            if (message.type === "ready") {
                createdId = createTicket().Ticket_Id;
                return false;
            }
            return message.type === REALTIME_EVENT.TICKET_CREATED;
        });
        assert.equal(result.messages[0].type, "ready");
        const created = result.messages.find((m) => m.type === REALTIME_EVENT.TICKET_CREATED);
        assert.equal(created.ticketId, createdId);
        for (const key of Object.keys(created)) assert.ok(ALLOWED_KEYS.has(key), key);
        result.ws.close();

        const bad = await connect(hub.url, { type: "auth", token: "not-a-jwt" });
        assert.equal(bad.closeCode, 4001);
        assert.deepEqual(bad.messages, []);
    } finally {
        await hub.close();
    }
});
