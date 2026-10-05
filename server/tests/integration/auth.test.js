require("../helpers/env");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { setupDatabase, getDB } = require("../helpers/db");
const { startApi } = require("../helpers/api");
const { TEST_PASSWORD, agentWithRole, systemAgentId } = require("../helpers/fixtures");
const authService = require("../../src/services/auth.service");
const agentService = require("../../src/services/agent.service");
const { ALL_PERMISSION_KEYS } = require("../../src/constants/permissions");

let api;
before(async () => {
    setupDatabase();
    api = await startApi();
});
after(() => api.close());

// ---- local helpers ----

const roleId = (roleKey) => getDB().prepare("SELECT Role_Id FROM HD_ROLE_MASTER WHERE Role_Key = ?").get(roleKey).Role_Id;
const adminActor = () => authService.buildPrincipal(agentWithRole("ADMIN").Agent_Id);

let agentSeq = 0;
/** A brand-new agent (so each test owns its state) with an optional sign-in. */
const newAgent = (roleKey = "TEAM_MEMBER", { password = TEST_PASSWORD, mustChange = false } = {}) => {
    agentSeq += 1;
    const agent = agentService.createAgent({
        firstName: "Auth",
        lastName: `Tester ${agentSeq}`,
        email: `auth.tester${agentSeq}@example.com`,
        roleId: roleId(roleKey)
    }, adminActor());
    if (password) {
        authService.setPassword(agent.Agent_Id, password, { mustChange, actorAgentId: systemAgentId() });
    }
    return agent;
};

const login = (email, password) => api.post("/api/v1/auth/login", null, { email, password });

const loginEvents = (email) => getDB().prepare(
    "SELECT * FROM HD_AUTH_LOGIN_EVENT WHERE Login_Email = ? ORDER BY rowid"
).all(email);

const credentialOf = (agentId) => getDB().prepare(
    "SELECT * FROM HD_AGENT_CREDENTIAL WHERE Agent_Id = ? AND Is_Deleted = 'N'"
).get(agentId);

// ---- login ----

test("login with email and password returns a token and the agent profile", async () => {
    const agent = newAgent("TEAM_MEMBER");
    const res = await login(agent.Email, TEST_PASSWORD);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.agent.agentId, agent.Agent_Id);
    assert.equal(res.body.data.agent.roleKey, "TEAM_MEMBER");
    assert.equal(res.body.data.agent.hasCredential, undefined, "internal flag is not exposed");

    const me = await api.get("/api/v1/auth/me", res.body.data.token);
    assert.equal(me.status, 200);
    assert.equal(me.body.data.agentId, agent.Agent_Id);

    const events = loginEvents(agent.Email);
    assert.equal(events.length, 1);
    assert.equal(events[0].Event_Type, "LOGIN_SUCCESS");
    assert.equal(events[0].Agent_Id, agent.Agent_Id);
    assert.equal(events[0].Failure_Code, null);
    assert.ok(credentialOf(agent.Agent_Id).Last_Login_Time, "last login time is stamped");
});

test("login email is case-insensitive", async () => {
    const agent = newAgent();
    const res = await login(`  ${agent.Email.toUpperCase()}  `, TEST_PASSWORD);
    assert.equal(res.status, 200);
    assert.equal(loginEvents(agent.Email)[0].Event_Type, "LOGIN_SUCCESS");
});

test("login sets an httpOnly session cookie", async () => {
    const agent = newAgent();
    const res = await fetch(`${api.base}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: agent.Email, password: TEST_PASSWORD })
    });
    assert.equal(res.status, 200);
    const cookie = res.headers.get("set-cookie") || "";
    assert.match(cookie, /HttpOnly/i);
});

test("wrong password is refused with 401 and recorded as BAD_PASSWORD", async () => {
    const agent = newAgent();
    const res = await login(agent.Email, "WrongPass123");
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, "INVALID_CREDENTIALS");
    assert.equal(res.body.error.message, "Invalid email or password");

    const events = loginEvents(agent.Email);
    assert.equal(events.length, 1);
    assert.equal(events[0].Event_Type, "LOGIN_FAILURE");
    assert.equal(events[0].Failure_Code, "BAD_PASSWORD");
    assert.equal(events[0].Agent_Id, agent.Agent_Id);
    assert.equal(credentialOf(agent.Agent_Id).Failed_Login_Count, 1);
});

test("unknown email gets the same 401 as a wrong password (no user enumeration)", async () => {
    const agent = newAgent();
    const wrong = await login(agent.Email, "WrongPass123");
    const unknown = await login("nobody.here@example.com", "WrongPass123");
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.error.code, wrong.body.error.code);
    assert.equal(unknown.body.error.message, wrong.body.error.message);

    const events = loginEvents("nobody.here@example.com");
    assert.equal(events.length, 1);
    assert.equal(events[0].Event_Type, "LOGIN_FAILURE");
    assert.equal(events[0].Failure_Code, "UNKNOWN_EMAIL");
    assert.equal(events[0].Agent_Id, null);
});

test("an agent without a sign-in gets the same 401, recorded as NO_CREDENTIAL", async () => {
    const agent = newAgent("TEAM_MEMBER", { password: null });
    const res = await login(agent.Email, "WrongPass123");
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, "INVALID_CREDENTIALS");
    assert.equal(res.body.error.message, "Invalid email or password");
    const events = loginEvents(agent.Email);
    assert.equal(events[0].Failure_Code, "NO_CREDENTIAL");
    assert.equal(events[0].Agent_Id, agent.Agent_Id);
});

test("login body is validated", async () => {
    const res = await api.post("/api/v1/auth/login", null, { email: "not-an-email" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
});

// ---- lockout ----

test("three wrong passwords lock the account, even against the right password", async () => {
    const agent = newAgent();
    for (let i = 1; i <= 3; i += 1) {
        const res = await login(agent.Email, `WrongPass${i}`);
        assert.equal(res.status, 401, `attempt ${i} is a plain bad password`);
    }
    const credential = credentialOf(agent.Agent_Id);
    assert.ok(credential.Locked_Until, "Locked_Until is set");
    const lockMinutes = (Date.parse(credential.Locked_Until) - Date.now()) / 60000;
    assert.ok(lockMinutes > 9 && lockMinutes <= 10.1, `locked for ~10 minutes (got ${lockMinutes.toFixed(2)})`);

    const locked = await login(agent.Email, TEST_PASSWORD);
    assert.equal(locked.status, 403);
    assert.equal(locked.body.error.code, "ACCOUNT_LOCKED");

    const events = loginEvents(agent.Email);
    assert.deepEqual(events.map((e) => e.Failure_Code), ["BAD_PASSWORD", "BAD_PASSWORD", "BAD_PASSWORD", "LOCKED"]);
});

test("a successful login resets the failed-attempt counter", async () => {
    const agent = newAgent();
    await login(agent.Email, "WrongPass1");
    await login(agent.Email, "WrongPass2");
    assert.equal((await login(agent.Email, TEST_PASSWORD)).status, 200);
    assert.equal(credentialOf(agent.Agent_Id).Failed_Login_Count, 0);
    // Two more misses must not lock (counter started again from zero).
    await login(agent.Email, "WrongPass3");
    await login(agent.Email, "WrongPass4");
    assert.equal((await login(agent.Email, TEST_PASSWORD)).status, 200);
});

test("an expired lock no longer blocks sign-in", async () => {
    const agent = newAgent();
    for (let i = 1; i <= 3; i += 1) await login(agent.Email, `WrongPass${i}`);
    assert.equal((await login(agent.Email, TEST_PASSWORD)).status, 403);

    // Move the lock into the past instead of waiting 10 minutes.
    getDB().prepare("UPDATE HD_AGENT_CREDENTIAL SET Locked_Until = ? WHERE Agent_Id = ? AND Is_Deleted = 'N'")
        .run("2000-01-01T00:00:00.000+05:30", agent.Agent_Id);
    const res = await login(agent.Email, TEST_PASSWORD);
    assert.equal(res.status, 200);
    assert.equal(credentialOf(agent.Agent_Id).Locked_Until, null);
});

// ---- inactive / deactivated / revoked ----

test("an inactive agent cannot sign in", async () => {
    const agent = newAgent();
    getDB().prepare("UPDATE HD_AGENT_MASTER SET Status = 'Inactive' WHERE Agent_Id = ?").run(agent.Agent_Id);
    const res = await login(agent.Email, TEST_PASSWORD);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "ACCOUNT_INACTIVE");
    assert.equal(loginEvents(agent.Email).at(-1).Failure_Code, "INACTIVE");
});

test("an inactive agent with a wrong password gets the generic 401", async () => {
    const agent = newAgent();
    getDB().prepare("UPDATE HD_AGENT_MASTER SET Status = 'Inactive' WHERE Agent_Id = ?").run(agent.Agent_Id);
    const res = await login(agent.Email, "WrongPass123");
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, "INVALID_CREDENTIALS");
});

test("an existing token stops working once the agent is deactivated", async () => {
    const agent = newAgent();
    const token = (await login(agent.Email, TEST_PASSWORD)).body.data.token;
    assert.equal((await api.get("/api/v1/tickets", token)).status, 200);

    getDB().prepare("UPDATE HD_AGENT_MASTER SET Status = 'Inactive' WHERE Agent_Id = ?").run(agent.Agent_Id);
    const res = await api.get("/api/v1/tickets", token);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, "ACCOUNT_INACTIVE");
});

test("an existing token stops working once the sign-in is revoked", async () => {
    const agent = newAgent();
    const token = (await login(agent.Email, TEST_PASSWORD)).body.data.token;
    authService.revokeLogin(agent.Agent_Id, systemAgentId());
    const res = await api.get("/api/v1/auth/me", token);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, "INVALID_TOKEN");
});

test("an existing token stops working once the agent is deleted", async () => {
    const agent = newAgent();
    const token = (await login(agent.Email, TEST_PASSWORD)).body.data.token;
    agentService.deleteAgent(agent.Agent_Id, adminActor());
    const res = await api.get("/api/v1/tickets", token);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, "INVALID_TOKEN");
});

// ---- token handling ----

test("forged, expired and malformed tokens are refused", async () => {
    const agent = newAgent();
    const forged = jwt.sign({ sub: agent.Agent_Id }, "some-other-secret");
    assert.equal((await api.get("/api/v1/auth/me", forged)).status, 401);

    const expired = jwt.sign({ sub: agent.Agent_Id, exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);
    const expiredRes = await api.get("/api/v1/auth/me", expired);
    assert.equal(expiredRes.status, 401);
    assert.equal(expiredRes.body.error.code, "INVALID_TOKEN");

    const basic = await fetch(`${api.base}/api/v1/auth/me`, { headers: { Authorization: "Basic abc" } });
    assert.equal(basic.status, 401);
});

test("the session cookie authenticates GET requests but not writes", async () => {
    const agent = newAgent();
    const token = (await login(agent.Email, TEST_PASSWORD)).body.data.token;
    const { sessionCookieName } = require("../../src/config/auth");
    const header = { Cookie: `${sessionCookieName}=${token}` };

    const get = await fetch(`${api.base}/api/v1/auth/me`, { headers: header });
    assert.equal(get.status, 200);

    const post = await fetch(`${api.base}/api/v1/auth/logout`, { method: "POST", headers: header });
    assert.equal(post.status, 401, "cookie-only write is refused (CSRF guard)");
});

// ---- /auth/me ----

test("/auth/me returns the role and its permissions from the database", async () => {
    const lead = newAgent("TEAM_LEAD");
    const token = (await login(lead.Email, TEST_PASSWORD)).body.data.token;
    const res = await api.get("/api/v1/auth/me", token);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.roleKey, "TEAM_LEAD");
    assert.equal(res.body.data.roleName, "Team Lead");
    assert.ok(res.body.data.permissions.includes("tickets.view"));
    assert.ok(res.body.data.permissions.includes("holidays.manage"));
    assert.ok(!res.body.data.permissions.includes("admin.access"));
    assert.equal(res.body.data.mustChangePassword, false);

    const admin = newAgent("ADMIN");
    const adminToken = (await login(admin.Email, TEST_PASSWORD)).body.data.token;
    const adminMe = await api.get("/api/v1/auth/me", adminToken);
    assert.deepEqual([...adminMe.body.data.permissions].sort(), [...ALL_PERMISSION_KEYS].sort());
});

// ---- temporary password ----

test("a temporary password only allows /auth/me, /auth/change-password and /auth/logout", async () => {
    const agent = newAgent("MANAGER", { password: "Temp1234", mustChange: true });
    const res = await login(agent.Email, "Temp1234");
    assert.equal(res.status, 200);
    assert.equal(res.body.data.agent.mustChangePassword, true);
    const token = res.body.data.token;

    const me = await api.get("/api/v1/auth/me", token);
    assert.equal(me.status, 200);
    assert.equal(me.body.data.mustChangePassword, true);

    const blocked = [
        ["get", "/api/v1/tickets"],
        ["get", "/api/v1/agents"],
        ["get", "/api/v1/admin/users"],
        ["get", "/api/v1/holidays"],
        ["post", "/api/v1/agents"]
    ];
    for (const [method, path] of blocked) {
        const r = await api[method](path, token, method === "post" ? {} : undefined);
        assert.equal(r.status, 403, `${method.toUpperCase()} ${path}`);
        assert.equal(r.body.error.code, "PASSWORD_CHANGE_REQUIRED", `${method.toUpperCase()} ${path}`);
    }

    const logout = await api.post("/api/v1/auth/logout", token);
    assert.equal(logout.status, 200);
});

test("change-password enforces the password policy", async () => {
    const agent = newAgent("TEAM_MEMBER", { password: "Temp1234", mustChange: true });
    const token = (await login(agent.Email, "Temp1234")).body.data.token;
    const change = (currentPassword, newPassword) => api.post("/api/v1/auth/change-password", token, { currentPassword, newPassword });

    const wrongCurrent = await change("NotMine99", "NewPass2026");
    assert.equal(wrongCurrent.status, 400);
    assert.equal(wrongCurrent.body.error.code, "INVALID_CREDENTIALS");

    const same = await change("Temp1234", "Temp1234");
    assert.equal(same.status, 400);
    assert.equal(same.body.error.code, "WEAK_PASSWORD");

    for (const weak of ["Ab1", "abcdefgh", "12345678", "a".repeat(72) + "1"]) {
        const res = await change("Temp1234", weak);
        assert.equal(res.status, 400, `"${weak.slice(0, 12)}" is refused`);
        assert.equal(res.body.error.code, "WEAK_PASSWORD");
    }
    assert.equal(credentialOf(agent.Agent_Id).Must_Change_Password, "Y", "still flagged after refused changes");
});

test("a successful change-password clears the flag and unlocks the API", async () => {
    const agent = newAgent("TEAM_MEMBER", { password: "Temp1234", mustChange: true });
    const token = (await login(agent.Email, "Temp1234")).body.data.token;

    const res = await api.post("/api/v1/auth/change-password", token, { currentPassword: "Temp1234", newPassword: "MyOwnPass9" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.mustChangePassword, false);
    assert.equal(credentialOf(agent.Agent_Id).Must_Change_Password, "N");

    // The same token now reaches the rest of the API.
    assert.equal((await api.get("/api/v1/tickets", token)).status, 200);

    assert.equal((await login(agent.Email, "Temp1234")).status, 401, "old password no longer works");
    assert.equal((await login(agent.Email, "MyOwnPass9")).status, 200);
});

test("logout records a LOGOUT event", async () => {
    const agent = newAgent();
    const token = (await login(agent.Email, TEST_PASSWORD)).body.data.token;
    const res = await api.post("/api/v1/auth/logout", token);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.loggedOut, true);
    const events = loginEvents(agent.Email);
    assert.deepEqual(events.map((e) => e.Event_Type), ["LOGIN_SUCCESS", "LOGOUT"]);
    assert.equal(events[1].Agent_Id, agent.Agent_Id);
});

test("logout without a token is refused", async () => {
    const res = await api.post("/api/v1/auth/logout", null);
    assert.equal(res.status, 401);
});
