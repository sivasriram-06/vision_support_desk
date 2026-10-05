require("../helpers/env");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupDatabase, getDB } = require("../helpers/db");
const { startApi } = require("../helpers/api");
const { agentWithRole, signIn, supportTeam, bankOf, createTicket, systemAgentId } = require("../helpers/fixtures");
const ticketService = require("../../src/services/ticket.service");

// Fixed 2026 dates (IST); 2026-03-06 is a Friday, no seeded holidays in March.
const ist = (local) => `${local}:00.000+05:30`;

let api;
let admin;
let lead;
let teamId;

const ticketRow = (ticketId) => getDB().prepare("SELECT * FROM HD_TICKET_MASTER WHERE Ticket_Id = ?").get(ticketId);
const triggers = (ticketId) => getDB().prepare(
    "SELECT Level_No, Trigger_Time FROM HD_TICKET_ESCALATION WHERE Ticket_Id = ? ORDER BY Level_No"
).all(ticketId).map((r) => [r.Level_No, r.Trigger_Time]);
const isDeleted = (table, key, id) => getDB().prepare(`SELECT Is_Deleted FROM ${table} WHERE ${key} = ?`).get(id).Is_Deleted;

before(async () => {
    setupDatabase();
    admin = signIn(agentWithRole("ADMIN"));
    lead = signIn(agentWithRole("TEAM_LEAD"));
    teamId = supportTeam().Department_Id;
    api = await startApi();
});
after(() => api.close());

// ---------------------------------------------------------------- permissions

test("config.manage is required to change priorities, escalation levels, picklists and products", async () => {
    const member = signIn(agentWithRole("TEAM_MEMBER"));
    for (const token of [lead, member]) {
        assert.equal((await api.post("/api/v1/priority-sla", token, { priority: "PX", slaHours: 5 })).status, 403);
        assert.equal((await api.put("/api/v1/priority-sla/P1", token, { slaHours: 5 })).status, 403);
        assert.equal((await api.delete("/api/v1/priority-sla/P1", token)).status, 403);
        assert.equal((await api.post("/api/v1/escalation-levels", token, { priority: "P1", levelNo: 9, offsetHours: 99 })).status, 403);
        assert.equal((await api.post("/api/v1/picklists", token, { field: "STATUS", value: "Nope" })).status, 403);
        assert.equal((await api.post("/api/v1/products", token, { productName: "Nope" })).status, 403);
    }
    // Reading config is open to every signed-in agent.
    assert.equal((await api.get("/api/v1/priority-sla", member)).status, 200);
    assert.equal((await api.get("/api/v1/escalation-levels", member)).status, 200);
    assert.equal((await api.get("/api/v1/picklists?field=STATUS", member)).status, 200);
    assert.equal((await api.get("/api/v1/products", member)).status, 200);
});

test("teams.manage is required to add or edit banks", async () => {
    const body = { bankName: "Lead Bank", departmentId: teamId, supportStartIst: "10:30", supportEndIst: "19:30" };
    assert.equal((await api.post("/api/v1/banks", lead, body)).status, 403);
    const bank = bankOf(teamId);
    assert.equal((await api.patch(`/api/v1/banks/${bank.Bank_Id}`, lead, { remarks: "x" })).status, 403);
    assert.equal((await api.delete(`/api/v1/banks/${bank.Bank_Id}`, lead)).status, 403);
    assert.equal((await api.get("/api/v1/banks", lead)).status, 200);
});

// ---------------------------------------------------------------- priorities / SLA

test("priorities: create, refuse duplicate, change hours, soft delete", async () => {
    const created = await api.post("/api/v1/priority-sla", admin, { priority: "P4", slaHours: 480 });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.Sla_Hours, 480);

    assert.equal((await api.post("/api/v1/priority-sla", admin, { priority: "P4", slaHours: 10 })).status, 409);
    assert.equal((await api.post("/api/v1/priority-sla", admin, { priority: "P5", slaHours: 0 })).status, 400);

    const updated = await api.put("/api/v1/priority-sla/P4", admin, { slaHours: 400 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.Sla_Hours, 400);
    assert.equal((await api.put("/api/v1/priority-sla/NOPE", admin, { slaHours: 5 })).status, 404);

    const id = created.body.data.Priority_Sla_Config_Id;
    assert.equal((await api.delete("/api/v1/priority-sla/P4", admin)).status, 200);
    assert.equal(isDeleted("HD_PRIORITY_SLA_CONFIG", "Priority_Sla_Config_Id", id), "Y");
    const list = await api.get("/api/v1/priority-sla", admin);
    assert.ok(!list.body.data.some((p) => p.Priority === "P4"));
});

// ---------------------------------------------------------------- escalation levels

test("escalation levels: add, refuse duplicate and out-of-order, edit rebuilds open tickets' triggers, soft delete", async () => {
    const bank = bankOf(teamId);
    // Use a calendar-independent check: L3 trigger moves by exactly the offset change on a P1 ticket.
    const ticket = createTicket({ bankId: bank.Bank_Id, priority: "P1", createdTime: ist("2026-03-03T10:00") });
    const before3 = triggers(ticket.Ticket_Id).find(([lvl]) => lvl === 3)[1];

    assert.equal((await api.post("/api/v1/escalation-levels", admin, { priority: "P1", levelNo: 3, offsetHours: 20 })).status, 409);
    assert.equal((await api.post("/api/v1/escalation-levels", admin, { priority: "P1", levelNo: 4, offsetHours: 2 })).status, 400, "L4 must come after L3 (+8h)");
    assert.equal((await api.post("/api/v1/escalation-levels", admin, { priority: "P9", levelNo: 1, offsetHours: 2 })).status, 400, "unknown priority");

    const added = await api.post("/api/v1/escalation-levels", admin, { priority: "P1", levelNo: 4, offsetHours: 9 });
    assert.equal(added.status, 201);
    assert.deepEqual(triggers(ticket.Ticket_Id).map(([lvl]) => lvl), [1, 2, 3, 4], "open ticket gets the new level");

    const levels = (await api.get("/api/v1/escalation-levels", admin)).body.data;
    const l3 = levels.find((l) => l.Priority === "P1" && l.Level_No === 3);
    assert.equal((await api.patch(`/api/v1/escalation-levels/${l3.Escalation_Level_Id}`, admin, { offsetHours: 10 })).status, 400, "would pass L4");
    const edited = await api.patch(`/api/v1/escalation-levels/${l3.Escalation_Level_Id}`, admin, { offsetHours: 7 });
    assert.equal(edited.status, 200);
    const after3 = triggers(ticket.Ticket_Id).find(([lvl]) => lvl === 3)[1];
    assert.equal(new Date(before3) - new Date(after3), 60 * 60 * 1000, "L3 trigger moved 1h earlier");

    const l4Id = added.body.data.Escalation_Level_Id;
    assert.equal((await api.delete(`/api/v1/escalation-levels/${l4Id}`, admin)).status, 200);
    assert.equal(isDeleted("HD_ESCALATION_LEVEL", "Escalation_Level_Id", l4Id), "Y");
    assert.deepEqual(triggers(ticket.Ticket_Id).map(([lvl]) => lvl), [1, 2, 3], "trigger for the deleted level is gone");

    // Restore the seeded offset for other tests.
    await api.patch(`/api/v1/escalation-levels/${l3.Escalation_Level_Id}`, admin, { offsetHours: 8 });
});

test("a closed ticket's triggers are left alone when levels change", async () => {
    const ticket = createTicket({ bankId: bankOf(teamId).Bank_Id, priority: "P2", createdTime: ist("2026-03-03T10:00") });
    ticketService.updateTicket(ticket.Ticket_Id, { status: "Closed" }, systemAgentId());
    const before = triggers(ticket.Ticket_Id);
    const levels = (await api.get("/api/v1/escalation-levels", admin)).body.data;
    const l3 = levels.find((l) => l.Priority === "P2" && l.Level_No === 3);
    assert.equal((await api.patch(`/api/v1/escalation-levels/${l3.Escalation_Level_Id}`, admin, { offsetHours: 30 })).status, 200);
    try {
        assert.deepEqual(triggers(ticket.Ticket_Id), before);
    } finally {
        await api.patch(`/api/v1/escalation-levels/${l3.Escalation_Level_Id}`, admin, { offsetHours: 24 });
    }
});

// ---------------------------------------------------------------- picklists

test("statuses: create with clock behaviour, refuse duplicate, soft delete", async () => {
    const created = await api.post("/api/v1/picklists", admin, { field: "STATUS", value: "Awaiting Vendor", clockBehaviour: "PAUSED" });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.Clock_Behaviour, "PAUSED");

    const plain = await api.post("/api/v1/picklists", admin, { field: "STATUS", value: "Triage" });
    assert.equal(plain.body.data.Clock_Behaviour, "NOT_STARTED", "a new status doesn't move the clock by default");

    assert.equal((await api.post("/api/v1/picklists", admin, { field: "STATUS", value: "Awaiting Vendor" })).status, 409);
    assert.equal((await api.post("/api/v1/picklists", admin, { field: "STATUS", value: "Open" })).status, 409, "seeded status");
    assert.equal((await api.post("/api/v1/picklists", admin, { field: "STATUS", value: "Bad", clockBehaviour: "SOMETIMES" })).status, 400);
    assert.equal((await api.post("/api/v1/picklists", admin, { field: "CLASSIFICATION", value: "X", clockBehaviour: "RUNNING" })).status, 400, "clock only for statuses");

    const id = plain.body.data.Picklist_Value_Id;
    assert.equal((await api.delete(`/api/v1/picklists/${id}`, admin)).status, 200);
    assert.equal(isDeleted("HD_PICKLIST_VALUE", "Picklist_Value_Id", id), "Y");
    const list = await api.get("/api/v1/picklists?field=STATUS", admin);
    assert.ok(!list.body.data.some((v) => v.Value === "Triage"));
});

test("renaming a status carries its tickets; changing its clock behaviour applies to tickets in it", async () => {
    const created = await api.post("/api/v1/picklists", admin, { field: "STATUS", value: "Parked", clockBehaviour: "NOT_STARTED" });
    const id = created.body.data.Picklist_Value_Id;
    const ticket = createTicket({ bankId: bankOf(teamId).Bank_Id, priority: "P2", status: "Parked" });
    const closed = createTicket({ bankId: bankOf(teamId).Bank_Id, priority: "P2", status: "Unassigned" });
    assert.equal(ticketRow(ticket.Ticket_Id).Clock_State, "NOT_STARTED");
    const due = ticketRow(ticket.Ticket_Id).Response_Due_Date;

    const clock = await api.patch(`/api/v1/picklists/${id}`, admin, { clockBehaviour: "RUNNING" });
    assert.equal(clock.status, 200);
    assert.equal(ticketRow(ticket.Ticket_Id).Clock_State, "RUNNING");
    const seg = getDB().prepare("SELECT * FROM HD_TICKET_CLOCK_SEGMENT WHERE Ticket_Id = ?").all(ticket.Ticket_Id);
    assert.equal(seg.length, 1);
    assert.equal(seg[0].Ended_Time, null);
    assert.equal(ticketRow(ticket.Ticket_Id).Response_Due_Date, due, "SLA unaffected by clock behaviour");
    assert.equal(ticketRow(closed.Ticket_Id).Clock_State, "NOT_STARTED", "tickets in other statuses untouched");

    const renamed = await api.patch(`/api/v1/picklists/${id}`, admin, { value: "Parked Long" });
    assert.equal(renamed.status, 200);
    assert.equal(ticketRow(ticket.Ticket_Id).Status, "Parked Long");

    assert.equal((await api.patch(`/api/v1/picklists/${id}`, admin, { value: "Open" })).status, 409, "rename onto an existing status");
});

test("classifications and categories: category is scoped by parent; rename and delete follow the parent", async () => {
    const parent = await api.post("/api/v1/picklists", admin, { field: "CLASSIFICATION", value: "Test Class" });
    assert.equal(parent.status, 201);
    const child = await api.post("/api/v1/picklists", admin, { field: "CATEGORY", value: "Test Cat", parentValue: "Test Class" });
    assert.equal(child.status, 201);
    assert.equal((await api.post("/api/v1/picklists", admin, { field: "CATEGORY", value: "Test Cat", parentValue: "Test Class" })).status, 409);
    assert.equal((await api.post("/api/v1/picklists", admin, { field: "CATEGORY", value: "Orphan", parentValue: "No Such Class" })).status, 400);
    assert.equal((await api.post("/api/v1/picklists", admin, { field: "CATEGORY", value: "No Parent" })).status, 400, "parentValue required");

    const renamed = await api.patch(`/api/v1/picklists/${parent.body.data.Picklist_Value_Id}`, admin, { value: "Test Class 2" });
    assert.equal(renamed.status, 200);
    const cats = await api.get(`/api/v1/picklists?field=CATEGORY&parentValue=${encodeURIComponent("Test Class 2")}`, admin);
    assert.ok(cats.body.data.some((c) => c.Value === "Test Cat"), "category follows the renamed classification");

    assert.equal((await api.delete(`/api/v1/picklists/${parent.body.data.Picklist_Value_Id}`, admin)).status, 200);
    assert.equal(isDeleted("HD_PICKLIST_VALUE", "Picklist_Value_Id", child.body.data.Picklist_Value_Id), "Y", "categories go with it");
});

test("team types: create, refuse duplicate, rename follows onto teams", async () => {
    const created = await api.post("/api/v1/picklists", admin, { field: "TEAM_TYPE", value: "Test Type" });
    assert.equal(created.status, 201);
    assert.equal((await api.post("/api/v1/picklists", admin, { field: "TEAM_TYPE", value: "Test Type" })).status, 409);
    getDB().prepare("UPDATE HD_DEPARTMENT_MASTER SET Team_Type = 'Test Type' WHERE Department_Id = ?").run(teamId);
    const original = getDB().prepare("SELECT Team_Type FROM HD_DEPARTMENT_MASTER WHERE Department_Id = ?").get(teamId);
    assert.equal(original.Team_Type, "Test Type");
    assert.equal((await api.patch(`/api/v1/picklists/${created.body.data.Picklist_Value_Id}`, admin, { value: "Test Type 2" })).status, 200);
    assert.equal(getDB().prepare("SELECT Team_Type FROM HD_DEPARTMENT_MASTER WHERE Department_Id = ?").get(teamId).Team_Type, "Test Type 2");
});

// ---------------------------------------------------------------- products

test("products: create, refuse duplicate, rename, soft delete", async () => {
    const created = await api.post("/api/v1/products", admin, { productName: "Test Product", description: "d" });
    assert.equal(created.status, 201);
    const id = created.body.data.Product_Id;
    assert.equal((await api.post("/api/v1/products", admin, { productName: "Test Product" })).status, 409);

    const other = await api.post("/api/v1/products", admin, { productName: "Other Product" });
    assert.equal((await api.patch(`/api/v1/products/${other.body.data.Product_Id}`, admin, { productName: "Test Product" })).status, 409);

    const renamed = await api.patch(`/api/v1/products/${id}`, admin, { productName: "Test Product 2" });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.data.Product_Name, "Test Product 2");

    assert.equal((await api.delete(`/api/v1/products/${id}`, admin)).status, 200);
    assert.equal(isDeleted("HD_PRODUCT_MASTER", "Product_Id", id), "Y");
    assert.equal((await api.get(`/api/v1/products/${id}`, admin)).status, 404);
    assert.ok(!(await api.get("/api/v1/products", admin)).body.data.some((p) => p.Product_Id === id));
});

// ---------------------------------------------------------------- banks

test("banks: create, refuse duplicate name and bad support window or time zone, soft delete", async () => {
    const body = {
        bankName: "Config Test Bank",
        departmentId: teamId,
        workingDays: ["MON", "TUE", "WED", "THU", "FRI"],
        timeZone: "Asia/Kolkata",
        supportStartIst: "10:30",
        supportEndIst: "19:30"
    };
    const created = await api.post("/api/v1/banks", admin, body);
    assert.equal(created.status, 201);
    const bank = created.body.data;
    assert.equal(bank.Working_Days, "MON,TUE,WED,THU,FRI");
    assert.equal(bank.Is_24x7, "N");

    assert.equal((await api.post("/api/v1/banks", admin, body)).status, 409);
    assert.equal((await api.post("/api/v1/banks", admin, { ...body, bankName: "Backwards", supportStartIst: "19:30", supportEndIst: "10:30" })).status, 400);
    assert.equal((await api.post("/api/v1/banks", admin, { ...body, bankName: "Nowhere", timeZone: "Mars/Olympus" })).status, 400);

    // Days are stored in week order; 24x7 stores every day.
    const days = await api.patch(`/api/v1/banks/${bank.Bank_Id}`, admin, { workingDays: ["SUN", "THU", "MON"] });
    assert.equal(days.body.data.Working_Days, "MON,THU,SUN");
    const allDay = await api.patch(`/api/v1/banks/${bank.Bank_Id}`, admin, { is24x7: true });
    assert.equal(allDay.body.data.Is_24x7, "Y");
    assert.equal(allDay.body.data.Working_Days, "MON,TUE,WED,THU,FRI,SAT,SUN");

    assert.equal((await api.delete(`/api/v1/banks/${bank.Bank_Id}`, admin)).status, 200);
    assert.equal(isDeleted("HD_BANK_MASTER", "Bank_Id", bank.Bank_Id), "Y");
    assert.equal((await api.get(`/api/v1/banks/${bank.Bank_Id}`, admin)).status, 404);
});
