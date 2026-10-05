require("../helpers/env");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupDatabase, getDB } = require("../helpers/db");
const { startApi } = require("../helpers/api");
const { agentWithRole, signIn, createTicket } = require("../helpers/fixtures");

let api;
before(async () => {
    setupDatabase();
    api = await startApi();
});
after(() => api.close());

test("fresh database is migrated and seeded", () => {
    const db = getDB();
    const migrations = db.prepare("SELECT COUNT(*) n FROM _migrations").get().n;
    assert.ok(migrations >= 31, `${migrations} migrations applied`);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM HD_ROLE_MASTER").get().n, 5);
    assert.ok(db.prepare("SELECT COUNT(*) n FROM HD_AGENT_MASTER").get().n > 10);
    assert.ok(db.prepare("SELECT COUNT(*) n FROM HD_BANK_MASTER").get().n > 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM HD_TICKET_MASTER").get().n, 0, "no tickets are seeded");
});

test("GET /health answers without sign-in", async () => {
    const res = await api.get("/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "ok");
});

test("API refuses requests without a token", async () => {
    const res = await api.get("/api/v1/tickets");
    assert.equal(res.status, 401);
});

test("a signed-in admin can list tickets", async () => {
    const token = signIn(agentWithRole("ADMIN"));
    createTicket({ subject: "Smoke ticket" });
    const res = await api.get("/api/v1/tickets", token);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.some((t) => t.Subject === "Smoke ticket"));
});
