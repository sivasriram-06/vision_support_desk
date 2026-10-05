require("../helpers/env");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupDatabase, getDB } = require("../helpers/db");
const { startApi } = require("../helpers/api");
const { TEST_PASSWORD, agentWithRole, signIn, systemAgentId } = require("../helpers/fixtures");
const authService = require("../../src/services/auth.service");
const agentService = require("../../src/services/agent.service");
const { ALL_PERMISSION_KEYS, PERMISSION_CATALOG } = require("../../src/constants/permissions");

let api;
let admin;
let manager;
let lead;
let member;
const tokens = {};

before(async () => {
    setupDatabase();
    api = await startApi();
    admin = agentWithRole("ADMIN");
    manager = agentWithRole("MANAGER");
    lead = agentWithRole("TEAM_LEAD");
    member = agentWithRole("TEAM_MEMBER");
    tokens.admin = signIn(admin);
    tokens.manager = signIn(manager);
    tokens.lead = signIn(lead);
    tokens.member = signIn(member);
});
after(() => api.close());

// ---- local helpers ----

const roleRow = (roleKey) => getDB().prepare("SELECT * FROM HD_ROLE_MASTER WHERE Role_Key = ?").get(roleKey);
const roleId = (roleKey) => roleRow(roleKey).Role_Id;
const rolePermissions = (roleKey) => JSON.parse(roleRow(roleKey).Permissions_Json || "[]");
const setRolePermissionsInDb = (roleKey, permissions) => getDB()
    .prepare("UPDATE HD_ROLE_MASTER SET Permissions_Json = ? WHERE Role_Key = ?")
    .run(JSON.stringify(permissions), roleKey);

let agentSeq = 0;
const nextEmail = () => {
    agentSeq += 1;
    return `admin.target${agentSeq}@example.com`;
};

/** A brand-new agent to act on, so seeded actors are never changed. Signed in when asked. */
const newAgent = (roleKey = "TEAM_MEMBER", { withLogin = false } = {}) => {
    const agent = agentService.createAgent({
        firstName: "Target",
        lastName: `Agent ${agentSeq + 1}`,
        email: nextEmail(),
        roleId: roleId(roleKey)
    }, authService.buildPrincipal(admin.Agent_Id));
    return withLogin ? { ...agent, token: signIn(agent) } : agent;
};

const login = (email, password) => api.post("/api/v1/auth/login", null, { email, password });

const agentRowAnyState = (agentId) => getDB().prepare("SELECT * FROM HD_AGENT_MASTER WHERE Agent_Id = ?").get(agentId);
const credentialRows = (agentId) => getDB().prepare("SELECT * FROM HD_AGENT_CREDENTIAL WHERE Agent_Id = ?").all(agentId);

// ---- admin.access gate ----

test("Admin and Manager can open the Admin page routes; Team Lead and Member get 403", async () => {
    const routes = ["/api/v1/admin/users", "/api/v1/admin/permissions", "/api/v1/admin/login-events", "/api/v1/admin/mail-integration"];
    for (const path of routes) {
        assert.equal((await api.get(path, tokens.admin)).status, 200, `admin ${path}`);
        assert.equal((await api.get(path, tokens.manager)).status, 200, `manager ${path}`);
        for (const who of ["lead", "member"]) {
            const res = await api.get(path, tokens[who]);
            assert.equal(res.status, 403, `${who} ${path}`);
            assert.equal(res.body.error.code, "FORBIDDEN");
        }
    }
});

test("Team Lead and Member cannot change permissions, passwords or sign-ins", async () => {
    const target = newAgent();
    for (const who of ["lead", "member"]) {
        const t = tokens[who];
        assert.equal((await api.put(`/api/v1/admin/roles/${roleId("TEAM_MEMBER")}/permissions`, t, { permissions: ALL_PERMISSION_KEYS })).status, 403);
        assert.equal((await api.put(`/api/v1/admin/users/${target.Agent_Id}/password`, t, { password: "Temp1234" })).status, 403);
        assert.equal((await api.delete(`/api/v1/admin/users/${target.Agent_Id}/password`, t)).status, 403);
    }
    assert.deepEqual(rolePermissions("TEAM_MEMBER"), ["tickets.view", "tickets.reply", "tickets.edit_status"], "member role unchanged");
    assert.equal(credentialRows(target.Agent_Id).length, 0, "no sign-in was created");
});

test("role list is open to admin.access or agents.manage only", async () => {
    const res = await api.get("/api/v1/admin/roles", tokens.manager);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map((r) => r.Role_Key), ["ADMIN", "MANAGER", "TEAM_LEAD", "ASSISTANT_TEAM_LEAD", "TEAM_MEMBER"]);
    const adminRole = res.body.data.find((r) => r.Role_Key === "ADMIN");
    assert.equal(adminRole.Is_Locked, true);
    assert.equal(res.body.data.find((r) => r.Role_Key === "MANAGER").Is_Locked, false);
    assert.ok(res.body.data.find((r) => r.Role_Key === "MANAGER").permissions.includes("admin.access"), "Manager has admin.access by default");

    assert.equal((await api.get("/api/v1/admin/roles", tokens.lead)).status, 403);
});

test("permission catalogue lists every permission key", async () => {
    const res = await api.get("/api/v1/admin/permissions", tokens.manager);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map((p) => p.key), PERMISSION_CATALOG.map((p) => p.key));
});

// ---- role permission matrix ----

test("a permission granted to a role takes effect on the very next request, and revoking it does too", async () => {
    const before = rolePermissions("TEAM_MEMBER");
    try {
        assert.equal((await api.get("/api/v1/admin/users", tokens.member)).status, 403);

        const grant = await api.put(`/api/v1/admin/roles/${roleId("TEAM_MEMBER")}/permissions`, tokens.manager, {
            permissions: [...before, "admin.access"]
        });
        assert.equal(grant.status, 200);
        assert.ok(grant.body.data.permissions.includes("admin.access"));

        // Same token as before - the role is read from the DB per request.
        assert.equal((await api.get("/api/v1/admin/users", tokens.member)).status, 200);
        const me = await api.get("/api/v1/auth/me", tokens.member);
        assert.ok(me.body.data.permissions.includes("admin.access"));

        const revoke = await api.put(`/api/v1/admin/roles/${roleId("TEAM_MEMBER")}/permissions`, tokens.admin, { permissions: before });
        assert.equal(revoke.status, 200);
        assert.equal((await api.get("/api/v1/admin/users", tokens.member)).status, 403);
    } finally {
        setRolePermissionsInDb("TEAM_MEMBER", before);
    }
});

test("role permissions are de-duplicated and stored in catalogue order", async () => {
    const before = rolePermissions("ASSISTANT_TEAM_LEAD");
    try {
        const res = await api.put(`/api/v1/admin/roles/${roleId("ASSISTANT_TEAM_LEAD")}/permissions`, tokens.admin, {
            permissions: ["tickets.reply", "tickets.view", "tickets.view"]
        });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.data.permissions, ["tickets.view", "tickets.reply"]);
        assert.deepEqual(rolePermissions("ASSISTANT_TEAM_LEAD"), ["tickets.view", "tickets.reply"]);
    } finally {
        setRolePermissionsInDb("ASSISTANT_TEAM_LEAD", before);
    }
});

test("unknown permission keys and unknown roles are refused", async () => {
    const before = rolePermissions("TEAM_LEAD");
    const bad = await api.put(`/api/v1/admin/roles/${roleId("TEAM_LEAD")}/permissions`, tokens.admin, { permissions: ["tickets.view", "root.everything"] });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, "VALIDATION_ERROR");
    assert.deepEqual(rolePermissions("TEAM_LEAD"), before, "nothing saved");

    const missing = await api.put("/api/v1/admin/roles/NO_SUCH_ROLE/permissions", tokens.admin, { permissions: [] });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, "ROLE_NOT_FOUND");

    const noBody = await api.put(`/api/v1/admin/roles/${roleId("TEAM_LEAD")}/permissions`, tokens.admin, {});
    assert.equal(noBody.status, 400);
});

test("the Admin role is locked: it cannot be edited and always has every permission", async () => {
    for (const who of ["admin", "manager"]) {
        const res = await api.put(`/api/v1/admin/roles/${roleId("ADMIN")}/permissions`, tokens[who], { permissions: [] });
        assert.equal(res.status, 403, who);
        assert.equal(res.body.error.code, "FORBIDDEN");
    }

    // Even if the stored JSON were emptied, Admin keeps full access.
    const stored = roleRow("ADMIN").Permissions_Json;
    try {
        setRolePermissionsInDb("ADMIN", []);
        const me = await api.get("/api/v1/auth/me", tokens.admin);
        assert.deepEqual([...me.body.data.permissions].sort(), [...ALL_PERMISSION_KEYS].sort());
        assert.equal((await api.get("/api/v1/admin/users", tokens.admin)).status, 200);
    } finally {
        getDB().prepare("UPDATE HD_ROLE_MASTER SET Permissions_Json = ? WHERE Role_Key = 'ADMIN'").run(stored);
    }
});

// ---- users / temporary passwords ----

test("user list shows every agent with sign-in state, but not the system agent", async () => {
    const res = await api.get("/api/v1/admin/users", tokens.manager);
    assert.equal(res.status, 200);
    const ids = res.body.data.map((u) => u.Agent_Id);
    assert.ok(!ids.includes(systemAgentId()));
    const mine = res.body.data.find((u) => u.Agent_Id === manager.Agent_Id);
    assert.equal(mine.Has_Login, "Y");
    for (const user of res.body.data) {
        assert.equal(user.Password_Hash, undefined, "never returns a password hash");
    }
});

test("Manager issues a temporary password: agent signs in, must change it, then works normally", async () => {
    const target = newAgent();
    const res = await api.put(`/api/v1/admin/users/${target.Agent_Id}/password`, tokens.manager, { password: "Temp5678" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.Has_Login, "Y");
    assert.equal(res.body.data.Must_Change_Password, "Y");
    assert.equal(res.body.data.Password_Hash, undefined);

    const signin = await login(target.Email, "Temp5678");
    assert.equal(signin.status, 200);
    const token = signin.body.data.token;
    const blocked = await api.get("/api/v1/tickets", token);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, "PASSWORD_CHANGE_REQUIRED");

    const change = await api.post("/api/v1/auth/change-password", token, { currentPassword: "Temp5678", newPassword: "Chosen2026" });
    assert.equal(change.status, 200);
    assert.equal((await api.get("/api/v1/tickets", token)).status, 200);
});

test("resetting a password replaces the old one, clears a lockout and keeps one credential row", async () => {
    const target = newAgent("TEAM_MEMBER", { withLogin: true });
    for (let i = 1; i <= 3; i += 1) await login(target.Email, `WrongPass${i}`);
    assert.equal((await login(target.Email, TEST_PASSWORD)).body.error.code, "ACCOUNT_LOCKED");

    const res = await api.put(`/api/v1/admin/users/${target.Agent_Id}/password`, tokens.admin, { password: "Reset1234" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.Locked_Until, null);

    assert.equal((await login(target.Email, TEST_PASSWORD)).status, 401, "old password gone");
    assert.equal((await login(target.Email, "Reset1234")).status, 200);
    assert.equal(credentialRows(target.Agent_Id).filter((c) => c.Is_Deleted === "N").length, 1);
});

test("a temporary password reset immediately blocks the agent's existing token", async () => {
    const target = newAgent("TEAM_MEMBER", { withLogin: true });
    assert.equal((await api.get("/api/v1/tickets", target.token)).status, 200);
    await api.put(`/api/v1/admin/users/${target.Agent_Id}/password`, tokens.manager, { password: "Temp9999" });
    const res = await api.get("/api/v1/tickets", target.token);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "PASSWORD_CHANGE_REQUIRED");
});

test("only an Admin can reset or revoke another Admin's sign-in", async () => {
    const otherAdmin = newAgent("ADMIN", { withLogin: true });

    const reset = await api.put(`/api/v1/admin/users/${otherAdmin.Agent_Id}/password`, tokens.manager, { password: "Takeover1" });
    assert.equal(reset.status, 403);
    assert.equal(reset.body.error.code, "FORBIDDEN");
    const revoke = await api.delete(`/api/v1/admin/users/${otherAdmin.Agent_Id}/password`, tokens.manager);
    assert.equal(revoke.status, 403);
    assert.equal((await login(otherAdmin.Email, TEST_PASSWORD)).status, 200, "admin sign-in untouched");

    const byAdmin = await api.put(`/api/v1/admin/users/${otherAdmin.Agent_Id}/password`, tokens.admin, { password: "AdminTemp1" });
    assert.equal(byAdmin.status, 200);
});

test("password reset for an unknown agent returns 404", async () => {
    const res = await api.put("/api/v1/admin/users/NO_SUCH_AGENT/password", tokens.admin, { password: "Temp1234" });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "AGENT_NOT_FOUND");
    const empty = await api.put(`/api/v1/admin/users/${member.Agent_Id}/password`, tokens.admin, { password: "" });
    assert.equal(empty.status, 400);
});

test("revoking a sign-in ends the session and blocks login until a new password is issued", async () => {
    const target = newAgent("TEAM_MEMBER", { withLogin: true });

    const res = await api.delete(`/api/v1/admin/users/${target.Agent_Id}/password`, tokens.manager);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.Has_Login, "N");
    // Soft delete: the row stays, flagged.
    const rows = credentialRows(target.Agent_Id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].Is_Deleted, "Y");

    const old = await api.get("/api/v1/tickets", target.token);
    assert.equal(old.status, 401);
    assert.equal(old.body.error.code, "INVALID_TOKEN");

    const signin = await login(target.Email, TEST_PASSWORD);
    assert.equal(signin.status, 401);
    assert.equal(signin.body.error.code, "INVALID_CREDENTIALS");

    // A new temporary password restores access.
    const reissue = await api.put(`/api/v1/admin/users/${target.Agent_Id}/password`, tokens.manager, { password: "Again1234" });
    assert.equal(reissue.status, 200);
    assert.equal((await login(target.Email, "Again1234")).status, 200);
});

test("an admin cannot revoke their own sign-in", async () => {
    const res = await api.delete(`/api/v1/admin/users/${manager.Agent_Id}/password`, tokens.manager);
    assert.equal(res.status, 400);
    assert.equal((await api.get("/api/v1/auth/me", tokens.manager)).status, 200);
});

test("login events list shows recent sign-in attempts newest first", async () => {
    const target = newAgent("TEAM_MEMBER", { withLogin: true });
    await login(target.Email, "WrongPass1");
    await login(target.Email, TEST_PASSWORD);

    const res = await api.get("/api/v1/admin/login-events", tokens.manager);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length <= 100);
    const mine = res.body.data.filter((e) => e.Login_Email === target.Email);
    assert.deepEqual(mine.map((e) => e.Event_Type).sort(), ["LOGIN_FAILURE", "LOGIN_SUCCESS"]);
    assert.equal(mine.find((e) => e.Event_Type === "LOGIN_FAILURE").Failure_Code, "BAD_PASSWORD");
    assert.equal(mine[0].First_Name, "Target");
    const times = res.body.data.map((e) => e.Event_Time);
    assert.deepEqual(times, [...times].sort().reverse());
});

test("mail integration view never returns secrets", async () => {
    const res = await api.get("/api/v1/admin/mail-integration", tokens.manager);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.mailbox, "support@vsd-test.local");
    assert.equal(res.body.data.connected, false);
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes("test-client-secret"));
    assert.ok(!text.includes("vsd-test-secret"));
});

// ---- agents ----

test("creating, editing and deleting agents needs agents.manage", async () => {
    const target = newAgent();
    for (const who of ["lead", "member"]) {
        const create = await api.post("/api/v1/agents", tokens[who], { firstName: "No", email: nextEmail() });
        assert.equal(create.status, 403, `${who} create`);
        assert.equal((await api.patch(`/api/v1/agents/${target.Agent_Id}`, tokens[who], { firstName: "Hacked" })).status, 403, `${who} update`);
        assert.equal((await api.delete(`/api/v1/agents/${target.Agent_Id}`, tokens[who])).status, 403, `${who} delete`);
    }
    assert.equal(agentRowAnyState(target.Agent_Id).First_Name, "Target");
    assert.equal(agentRowAnyState(target.Agent_Id).Is_Deleted, "N");

    // Listing and reading agents is open to any signed-in agent.
    assert.equal((await api.get("/api/v1/agents", tokens.member)).status, 200);
    assert.equal((await api.get(`/api/v1/agents/${target.Agent_Id}`, tokens.member)).status, 200);
});

test("Manager creates an agent with a team and role, without a sign-in", async () => {
    const email = nextEmail();
    const res = await api.post("/api/v1/agents", tokens.manager, {
        firstName: "  New  ",
        lastName: "Hire",
        email: email.toUpperCase(),
        departmentId: lead.Primary_Department_Id,
        roleId: roleId("TEAM_MEMBER")
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.First_Name, "New");
    assert.equal(res.body.data.Email, email, "email stored lower-case");
    assert.equal(res.body.data.Role_Key, "TEAM_MEMBER");
    assert.equal(res.body.data.Primary_Department_Id, lead.Primary_Department_Id);
    assert.equal(res.body.data.Status, "Active");
    assert.equal(res.body.data.Has_Login, "N");
    assert.equal(res.body.data.Created_By, manager.Agent_Id);
});

test("duplicate agent email is refused on create and update (case-insensitive)", async () => {
    const existing = newAgent();
    const create = await api.post("/api/v1/agents", tokens.manager, { firstName: "Dup", email: existing.Email.toUpperCase() });
    assert.equal(create.status, 409);
    assert.equal(create.body.error.code, "AGENT_DUPLICATE");

    const other = newAgent();
    const update = await api.patch(`/api/v1/agents/${other.Agent_Id}`, tokens.manager, { email: existing.Email });
    assert.equal(update.status, 409);
    assert.equal(update.body.error.code, "AGENT_DUPLICATE");
});

test("agent payloads are validated", async () => {
    const missing = await api.post("/api/v1/agents", tokens.manager, { email: nextEmail() });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error.code, "VALIDATION_ERROR");
    const badStatus = await api.patch(`/api/v1/agents/${newAgent().Agent_Id}`, tokens.manager, { status: "Sleeping" });
    assert.equal(badStatus.status, 400);
    const unknown = await api.patch("/api/v1/agents/NO_SUCH_AGENT", tokens.manager, { firstName: "X" });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error.code, "AGENT_NOT_FOUND");
});

test("role changes need admin.access, and only an Admin can grant the Admin role", async () => {
    const target = newAgent();

    const byManager = await api.patch(`/api/v1/agents/${target.Agent_Id}`, tokens.manager, { roleId: roleId("TEAM_LEAD") });
    assert.equal(byManager.status, 200);
    assert.equal(byManager.body.data.Role_Key, "TEAM_LEAD");

    const promote = await api.patch(`/api/v1/agents/${target.Agent_Id}`, tokens.manager, { roleId: roleId("ADMIN") });
    assert.equal(promote.status, 403);
    const createAdmin = await api.post("/api/v1/agents", tokens.manager, { firstName: "Sneaky", email: nextEmail(), roleId: roleId("ADMIN") });
    assert.equal(createAdmin.status, 403);

    const self = await api.patch(`/api/v1/agents/${manager.Agent_Id}`, tokens.manager, { roleId: roleId("TEAM_MEMBER") });
    assert.equal(self.status, 403, "no self role change");

    const byAdmin = await api.patch(`/api/v1/agents/${target.Agent_Id}`, tokens.admin, { roleId: roleId("ADMIN") });
    assert.equal(byAdmin.status, 200);
    assert.equal(byAdmin.body.data.Role_Key, "ADMIN");

    // agents.manage without admin.access may edit agents but not roles.
    const before = rolePermissions("TEAM_LEAD");
    try {
        setRolePermissionsInDb("TEAM_LEAD", [...before, "agents.manage"]);
        const plain = newAgent();
        const rename = await api.patch(`/api/v1/agents/${plain.Agent_Id}`, tokens.lead, { firstName: "Renamed" });
        assert.equal(rename.status, 200);
        const roleChange = await api.patch(`/api/v1/agents/${plain.Agent_Id}`, tokens.lead, { roleId: roleId("MANAGER") });
        assert.equal(roleChange.status, 403);
        assert.equal(agentRowAnyState(plain.Agent_Id).Role_Id, roleId("TEAM_MEMBER"));
    } finally {
        setRolePermissionsInDb("TEAM_LEAD", before);
    }
});

test("deactivating an agent signs them out; self and Admin deactivation are guarded", async () => {
    const target = newAgent("TEAM_MEMBER", { withLogin: true });
    const off = await api.patch(`/api/v1/agents/${target.Agent_Id}`, tokens.manager, { status: "Inactive" });
    assert.equal(off.status, 200);
    assert.equal(off.body.data.Status, "Inactive");
    const res = await api.get("/api/v1/tickets", target.token);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, "ACCOUNT_INACTIVE");
    assert.equal((await login(target.Email, TEST_PASSWORD)).body.error.code, "ACCOUNT_INACTIVE");

    const on = await api.patch(`/api/v1/agents/${target.Agent_Id}`, tokens.manager, { status: "Active" });
    assert.equal(on.status, 200);
    assert.equal((await api.get("/api/v1/tickets", target.token)).status, 200);

    assert.equal((await api.patch(`/api/v1/agents/${manager.Agent_Id}`, tokens.manager, { status: "Inactive" })).status, 403, "self");
    const otherAdmin = newAgent("ADMIN");
    assert.equal((await api.patch(`/api/v1/agents/${otherAdmin.Agent_Id}`, tokens.manager, { status: "Inactive" })).status, 403, "manager vs admin");
    assert.equal((await api.patch(`/api/v1/agents/${otherAdmin.Agent_Id}`, tokens.admin, { status: "Inactive" })).status, 200, "admin vs admin");
});

test("deleting an agent is a soft delete that also revokes their sign-in", async () => {
    const target = newAgent("TEAM_MEMBER", { withLogin: true });
    const res = await api.delete(`/api/v1/agents/${target.Agent_Id}`, tokens.manager);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.deleted, true);

    const row = agentRowAnyState(target.Agent_Id);
    assert.ok(row, "row is kept");
    assert.equal(row.Is_Deleted, "Y");
    assert.equal(row.Modified_By, manager.Agent_Id);
    assert.ok(credentialRows(target.Agent_Id).every((c) => c.Is_Deleted === "Y"), "credential revoked");

    assert.equal((await api.get("/api/v1/tickets", target.token)).status, 401);
    assert.equal((await login(target.Email, TEST_PASSWORD)).status, 401);
    assert.equal((await api.get(`/api/v1/agents/${target.Agent_Id}`, tokens.manager)).status, 404);
    const list = await api.get("/api/v1/agents", tokens.manager);
    assert.ok(!list.body.data.some((a) => a.Agent_Id === target.Agent_Id));

    // The email is free again for a new agent.
    const again = await api.post("/api/v1/agents", tokens.manager, { firstName: "Rehired", email: target.Email });
    assert.equal(again.status, 201);
    assert.notEqual(again.body.data.Agent_Id, target.Agent_Id);
});

test("agents cannot delete themselves and only an Admin can delete an Admin", async () => {
    const self = await api.delete(`/api/v1/agents/${manager.Agent_Id}`, tokens.manager);
    assert.equal(self.status, 403);
    const otherAdmin = newAgent("ADMIN");
    assert.equal((await api.delete(`/api/v1/agents/${otherAdmin.Agent_Id}`, tokens.manager)).status, 403);
    assert.equal(agentRowAnyState(otherAdmin.Agent_Id).Is_Deleted, "N");
    assert.equal((await api.delete(`/api/v1/agents/${otherAdmin.Agent_Id}`, tokens.admin)).status, 200);
    assert.equal((await api.delete(`/api/v1/agents/${otherAdmin.Agent_Id}`, tokens.admin)).status, 404, "already deleted");
});
