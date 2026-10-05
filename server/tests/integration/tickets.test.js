require("../helpers/env");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupDatabase, getDB } = require("../helpers/db");
const { startApi } = require("../helpers/api");
const { agentWithRole, signIn, supportTeam, bankOf, createContact, createTicket } = require("../helpers/fixtures");
const ticketService = require("../../src/services/ticket.service");
const { toIst } = require("../../src/utils/time");

const T = "/api/v1/tickets";
const HOUR_MS = 60 * 60 * 1000;

let api;
let team;
let bank;
let otherBank;
let admin;
let manager;
let lead;
let assistant;
let member;
const tokens = {};

/** No Assistant Team Lead is seeded - promote a seeded Team Member in this test DB. */
const makeAssistantTeamLead = (exclude) => {
    const db = getDB();
    const agent = agentWithRole("TEAM_MEMBER", { departmentId: team.Department_Id, exclude });
    const roleId = db.prepare("SELECT Role_Id FROM HD_ROLE_MASTER WHERE Role_Key = 'ASSISTANT_TEAM_LEAD'").get().Role_Id;
    db.prepare("UPDATE HD_AGENT_MASTER SET Role_Id = ? WHERE Agent_Id = ?").run(roleId, agent.Agent_Id);
    return { ...agent, Role_Key: "ASSISTANT_TEAM_LEAD" };
};

const historyOf = (ticketId) => getDB().prepare(
    "SELECT * FROM HD_TICKET_HISTORY WHERE Ticket_Id = ? ORDER BY Event_Time, History_Id"
).all(ticketId);

const rowOf = (ticketId) => getDB().prepare("SELECT * FROM HD_TICKET_MASTER WHERE Ticket_Id = ?").get(ticketId);

const setDueDate = (ticketId, msFromNow) => {
    getDB().prepare("UPDATE HD_TICKET_MASTER SET Response_Due_Date = ? WHERE Ticket_Id = ?")
        .run(toIst(Date.now() + msFromNow), ticketId);
};

before(async () => {
    setupDatabase();
    api = await startApi();
    team = supportTeam();
    bank = bankOf(team.Department_Id);
    otherBank = getDB().prepare(
        "SELECT * FROM HD_BANK_MASTER WHERE Department_Id <> ? AND Is_Deleted = 'N' ORDER BY Bank_Id LIMIT 1"
    ).get(team.Department_Id);
    admin = agentWithRole("ADMIN");
    manager = agentWithRole("MANAGER");
    lead = agentWithRole("TEAM_LEAD", { departmentId: team.Department_Id });
    member = agentWithRole("TEAM_MEMBER", { departmentId: team.Department_Id });
    assistant = makeAssistantTeamLead([member.Agent_Id]);
    for (const [key, agent] of Object.entries({ admin, manager, lead, assistant, member })) {
        tokens[key] = signIn(agent);
    }
});
after(() => api.close());

// ---------- create ----------

test("a Team Lead creates a ticket through the API", async () => {
    const contact = createContact();
    const res = await api.post(T, tokens.lead, {
        subject: "Create via API",
        description: "Card reports fail",
        channel: "Phone",
        departmentId: team.Department_Id,
        bankId: bank.Bank_Id,
        contactId: contact.Contact_Id,
        priority: "P1"
    });
    assert.equal(res.status, 201);
    const t = res.body.data;
    assert.match(t.Ticket_Number, /^\d{6}$/);
    assert.equal(t.Subject, "Create via API");
    assert.equal(t.Status, "Open");
    assert.equal(t.Status_Type, "Open");
    assert.equal(t.Priority, "P1");
    assert.equal(t.Channel, "Phone");
    assert.equal(t.Bank_Id, bank.Bank_Id);
    assert.equal(t.Department_Id, team.Department_Id);
    assert.equal(t.Contact_Id, contact.Contact_Id);
    assert.equal(t.Created_By, lead.Agent_Id);
    assert.ok(t.Response_Due_Date, "SLA due date is set from the priority");
    assert.ok(Array.isArray(t.Assignees));
    const created = historyOf(t.Ticket_Id).find((h) => h.Event_Name === "CREATED");
    assert.equal(created.Actor_Agent_Id, lead.Agent_Id);
    assert.equal(getDB().prepare("SELECT COUNT(*) n FROM HD_TICKET_METRICS WHERE Ticket_Id = ?").get(t.Ticket_Id).n, 1);
});

test("a ticket created with a bank goes to the bank's team", async () => {
    const res = await api.post(T, tokens.admin, {
        subject: "Bank routes team",
        channel: "Email",
        departmentId: team.Department_Id,
        bankId: otherBank.Bank_Id,
        contactId: createContact().Contact_Id,
        priority: "P2"
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.Department_Id, otherBank.Department_Id);
});

test("a Team Member may not create tickets", async () => {
    const res = await api.post(T, tokens.member, {
        subject: "Member create",
        channel: "Email",
        departmentId: team.Department_Id,
        contactId: createContact().Contact_Id
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "FORBIDDEN");
});

test("creating a ticket validates the body and the contact", async () => {
    const missing = await api.post(T, tokens.lead, { channel: "Email", departmentId: team.Department_Id, contactId: "x" });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error.code, "VALIDATION_ERROR");

    const badChannel = await api.post(T, tokens.lead, { subject: "s", channel: "Fax", departmentId: team.Department_Id, contactId: "x" });
    assert.equal(badChannel.status, 400);

    const noContact = await api.post(T, tokens.lead, { subject: "s", channel: "Email", departmentId: team.Department_Id, contactId: "999999999" });
    assert.equal(noContact.status, 400);
    assert.equal(noContact.body.error.code, "CONTACT_NOT_FOUND");

    const noTeam = await api.post(T, tokens.lead, { subject: "s", channel: "Email", departmentId: "999999999", contactId: createContact().Contact_Id });
    assert.equal(noTeam.status, 400);
    assert.equal(noTeam.body.error.code, "DEPARTMENT_NOT_FOUND");
});

// ---------- ticket numbers ----------

test("ticket numbers are unique 6-digit running numbers", () => {
    const a = createTicket({ subject: "Number A" });
    const b = createTicket({ subject: "Number B" });
    const c = createTicket({ subject: "Number C" });
    for (const t of [a, b, c]) assert.match(t.Ticket_Number, /^\d{6}$/);
    assert.equal(Number(b.Ticket_Number), Number(a.Ticket_Number) + 1);
    assert.equal(Number(c.Ticket_Number), Number(b.Ticket_Number) + 1);
    const dupes = getDB().prepare(
        "SELECT Ticket_Number, COUNT(*) n FROM HD_TICKET_MASTER GROUP BY Org_Id, Ticket_Number HAVING n > 1"
    ).all();
    assert.deepEqual(dupes, []);
});

test("a deleted ticket's number is not handed out again", async () => {
    const t = createTicket({ subject: "Number deleted" });
    const del = await api.delete(`${T}/${t.Ticket_Id}`, tokens.lead);
    assert.equal(del.status, 200);
    const next = createTicket({ subject: "Number after delete" });
    assert.equal(Number(next.Ticket_Number), Number(t.Ticket_Number) + 1);
});

test("the next number comes from the counter, not the row count", () => {
    const t = createTicket({ subject: "Counter base" });
    const live = getDB().prepare("SELECT COUNT(*) n FROM HD_TICKET_MASTER WHERE Is_Deleted = 'N'").get().n;
    const next = createTicket({ subject: "Counter next" });
    assert.equal(Number(next.Ticket_Number), Number(t.Ticket_Number) + 1);
    // Deleted tickets above keep their numbers, so the number runs ahead of the live row count.
    assert.ok(Number(next.Ticket_Number) > live + 1);
    const seq = getDB().prepare("SELECT Last_Id FROM HD_ID_SEQUENCE WHERE Table_Name = 'HD_TICKET_MASTER.Ticket_Number'").get();
    assert.equal(seq.Last_Id, Number(next.Ticket_Number));
});

// ---------- list ----------

test("list returns rows with display names and a paging block", async () => {
    const res = await api.get(`${T}?limit=2&page=1`, tokens.member);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 2);
    const p = res.body.paging;
    assert.equal(p.limit, 2);
    assert.equal(p.page, 1);
    assert.ok(p.total > 2);
    assert.equal(p.hasMore, true);
    assert.equal(p.nextCursor, "2");
    const row = res.body.data[0];
    for (const key of ["Ticket_Id", "Ticket_Number", "Subject", "Contact_Email", "Department_Name", "Bank_Name", "Escalation_Level", "Reopen_Count"]) {
        assert.ok(key in row, `row has ${key}`);
    }
    assert.ok(Array.isArray(row.Assignees));

    const last = await api.get(`${T}?limit=2&page=${Math.ceil(p.total / 2)}`, tokens.member);
    assert.equal(last.body.paging.hasMore, false);
    assert.equal(last.body.paging.nextCursor, null);
});

test("list rejects an unknown state and a limit above 100", async () => {
    assert.equal((await api.get(`${T}?state=lost`, tokens.admin)).status, 400);
    assert.equal((await api.get(`${T}?limit=101`, tokens.admin)).status, 400);
});

test("list searches the subject and the ticket number", async () => {
    const a = createTicket({ subject: "Zebra search alpha" });
    createTicket({ subject: "Zebra search beta" });
    const bySubject = await api.get(`${T}?search=${encodeURIComponent("Zebra search")}`, tokens.admin);
    assert.equal(bySubject.body.paging.total, 2);
    const byNumber = await api.get(`${T}?search=${a.Ticket_Number}`, tokens.admin);
    assert.ok(byNumber.body.data.some((t) => t.Ticket_Id === a.Ticket_Id));
    assert.ok(byNumber.body.data.every((t) => t.Ticket_Number.includes(a.Ticket_Number) || t.Subject.includes(a.Ticket_Number)));
});

test("list sorts by an allowed field in both directions", async () => {
    for (const s of ["Sortcase B", "Sortcase C", "Sortcase A"]) createTicket({ subject: s });
    const asc = await api.get(`${T}?search=Sortcase&sortBy=Subject&sortOrder=asc`, tokens.admin);
    assert.deepEqual(asc.body.data.map((t) => t.Subject), ["Sortcase A", "Sortcase B", "Sortcase C"]);
    const desc = await api.get(`${T}?search=Sortcase&sortBy=Subject&sortOrder=desc`, tokens.admin);
    assert.deepEqual(desc.body.data.map((t) => t.Subject), ["Sortcase C", "Sortcase B", "Sortcase A"]);
    // Unknown sort column falls back to Created_Time instead of reaching the SQL.
    const bogus = await api.get(`${T}?search=Sortcase&sortBy=${encodeURIComponent("Subject; DROP TABLE x")}`, tokens.admin);
    assert.equal(bogus.status, 200);
    assert.equal(bogus.body.data.length, 3);
});

test("list filters by status, priority, team, bank and customer", async () => {
    const contact = createContact();
    const p1 = createTicket({ subject: "Filter P1", contactId: contact.Contact_Id, priority: "P1" });
    const p3 = createTicket({ subject: "Filter P3", contactId: contact.Contact_Id, priority: "P3", bankId: otherBank.Bank_Id, departmentId: otherBank.Department_Id });
    ticketService.updateTicket(p3.Ticket_Id, { status: "In Progress" }, lead.Agent_Id);

    const ids = async (qs) => (await api.get(`${T}?contactId=${contact.Contact_Id}&${qs}`, tokens.admin)).body.data.map((t) => t.Ticket_Id).sort();

    assert.deepEqual(await ids(""), [p1.Ticket_Id, p3.Ticket_Id].sort());
    assert.deepEqual(await ids("priority=P1"), [p1.Ticket_Id]);
    assert.deepEqual(await ids(`status=${encodeURIComponent("In Progress")}`), [p3.Ticket_Id]);
    assert.deepEqual(await ids(`departmentId=${otherBank.Department_Id}`), [p3.Ticket_Id]);
    assert.deepEqual(await ids(`bankId=${otherBank.Bank_Id}`), [p3.Ticket_Id]);
    assert.deepEqual(await ids(`bankId=${bank.Bank_Id}`), [p1.Ticket_Id]);
});

test("list state filter splits open, closed and overdue", async () => {
    const contact = createContact();
    const open = createTicket({ subject: "State open", contactId: contact.Contact_Id });
    const overdue = createTicket({ subject: "State overdue", contactId: contact.Contact_Id });
    const closed = createTicket({ subject: "State closed", contactId: contact.Contact_Id });
    setDueDate(open.Ticket_Id, 48 * HOUR_MS);
    setDueDate(overdue.Ticket_Id, -2 * HOUR_MS);
    ticketService.updateTicket(closed.Ticket_Id, { status: "Closed" }, lead.Agent_Id);
    setDueDate(closed.Ticket_Id, -2 * HOUR_MS);

    const ids = async (state) => (await api.get(`${T}?contactId=${contact.Contact_Id}&state=${state}`, tokens.admin)).body.data.map((t) => t.Ticket_Id).sort();
    assert.deepEqual(await ids("open"), [open.Ticket_Id, overdue.Ticket_Id].sort());
    assert.deepEqual(await ids("closed"), [closed.Ticket_Id]);
    assert.deepEqual(await ids("overdue"), [overdue.Ticket_Id]);
});

test("list SLA-breached filter includes overdue open tickets and tickets closed late", async () => {
    const contact = createContact();
    const onTime = createTicket({ subject: "Breach on time", contactId: contact.Contact_Id });
    const late = createTicket({ subject: "Breach late open", contactId: contact.Contact_Id });
    const closedLate = createTicket({ subject: "Breach closed late", contactId: contact.Contact_Id });
    const closedOnTime = createTicket({ subject: "Breach closed on time", contactId: contact.Contact_Id });
    setDueDate(onTime.Ticket_Id, 48 * HOUR_MS);
    setDueDate(late.Ticket_Id, -1 * HOUR_MS);
    ticketService.updateTicket(closedLate.Ticket_Id, { status: "Closed" }, lead.Agent_Id);
    ticketService.updateTicket(closedOnTime.Ticket_Id, { status: "Closed" }, lead.Agent_Id);
    const db = getDB();
    db.prepare("UPDATE HD_TICKET_MASTER SET Resolved_Time = ?, Response_Due_Date = ? WHERE Ticket_Id = ?")
        .run(toIst(Date.now() - 1 * HOUR_MS), toIst(Date.now() - 5 * HOUR_MS), closedLate.Ticket_Id);
    db.prepare("UPDATE HD_TICKET_MASTER SET Resolved_Time = ?, Response_Due_Date = ? WHERE Ticket_Id = ?")
        .run(toIst(Date.now() - 5 * HOUR_MS), toIst(Date.now() - 1 * HOUR_MS), closedOnTime.Ticket_Id);

    const res = await api.get(`${T}?contactId=${contact.Contact_Id}&slaBreached=true`, tokens.admin);
    assert.deepEqual(res.body.data.map((t) => t.Ticket_Id).sort(), [late.Ticket_Id, closedLate.Ticket_Id].sort());
});

// ---------- detail ----------

test("ticket detail returns the ticket with its joined names", async () => {
    const t = createTicket({ subject: "Detail ticket" });
    const res = await api.get(`${T}/${t.Ticket_Id}`, tokens.member);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.Ticket_Id, t.Ticket_Id);
    assert.equal(res.body.data.Subject, "Detail ticket");
    assert.equal(res.body.data.Bank_Name, bank.Bank_Name);
    assert.equal(res.body.data.Department_Name, team.Department_Name);
    assert.ok(res.body.data.Contact_Email);
    assert.deepEqual(res.body.data.Assignees, []);
});

test("an unknown ticket id answers 404", async () => {
    const res = await api.get(`${T}/999999999`, tokens.admin);
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "TICKET_NOT_FOUND");
    assert.equal((await api.patch(`${T}/999999999`, tokens.admin, { status: "Open" })).status, 404);
    assert.equal((await api.delete(`${T}/999999999`, tokens.admin)).status, 404);
});

// ---------- update ----------

test("a Team Member may change the status and the change is recorded", async () => {
    const t = createTicket({ subject: "Member status" });
    const res = await api.patch(`${T}/${t.Ticket_Id}`, tokens.member, { status: "In Progress" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.Status, "In Progress");
    assert.equal(res.body.data.Modified_By, member.Agent_Id);
    const h = historyOf(t.Ticket_Id).find((r) => r.Event_Name === "STATUS_CHANGE");
    assert.equal(h.Field_Name, "Status");
    assert.equal(h.Old_Value, "Open");
    assert.equal(h.New_Value, "In Progress");
    assert.equal(h.Actor_Agent_Id, member.Agent_Id);
});

test("a Team Member may not edit properties", async () => {
    const t = createTicket({ subject: "Member properties" });
    const product = getDB().prepare("SELECT Product_Id FROM HD_PRODUCT_MASTER ORDER BY Product_Id LIMIT 1").get();
    const attempts = [
        { priority: "P1" },
        { bankId: otherBank.Bank_Id },
        { departmentId: otherBank.Department_Id },
        { productId: product.Product_Id },
        { classification: "Incident" },
        { category: "Application" },
        { status: "In Progress", priority: "P1" }
    ];
    for (const body of attempts) {
        const res = await api.patch(`${T}/${t.Ticket_Id}`, tokens.member, body);
        assert.equal(res.status, 403, `refused: ${JSON.stringify(body)}`);
        assert.equal(res.body.error.code, "FORBIDDEN");
    }
    const after = rowOf(t.Ticket_Id);
    assert.equal(after.Priority, "P2");
    assert.equal(after.Status, "Open", "a refused request changes nothing");
});

test("a Team Member re-saving unchanged properties is not refused", async () => {
    const t = createTicket({ subject: "Member resave" });
    const res = await api.patch(`${T}/${t.Ticket_Id}`, tokens.member, { status: "In Progress", priority: "P2", bankId: bank.Bank_Id });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.Status, "In Progress");
});

test("a Team Lead edits product and classification with history rows", async () => {
    const t = createTicket({ subject: "Lead properties" });
    const product = getDB().prepare("SELECT Product_Id FROM HD_PRODUCT_MASTER ORDER BY Product_Id LIMIT 1").get();
    const res = await api.patch(`${T}/${t.Ticket_Id}`, tokens.lead, {
        productId: product.Product_Id,
        classification: "Incident",
        category: "Application"
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.Product_Id, product.Product_Id);
    assert.equal(res.body.data.Classification, "Incident");
    const changes = historyOf(t.Ticket_Id).filter((h) => h.Event_Name === "FIELD_CHANGE");
    const byField = Object.fromEntries(changes.map((h) => [h.Field_Name, h]));
    assert.equal(byField.Product_Id.New_Value, product.Product_Id);
    assert.equal(byField.Product_Id.Old_Value, null);
    assert.equal(byField.Classification.New_Value, "Incident");
    assert.equal(byField.Category.Actor_Agent_Id, lead.Agent_Id);
});

test("choosing a bank moves the ticket to that bank's team", async () => {
    const t = createTicket({ subject: "Bank move" });
    assert.equal(t.Department_Id, team.Department_Id);
    const res = await api.patch(`${T}/${t.Ticket_Id}`, tokens.lead, { bankId: otherBank.Bank_Id });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.Bank_Id, otherBank.Bank_Id);
    assert.equal(res.body.data.Department_Id, otherBank.Department_Id);
    const fields = historyOf(t.Ticket_Id).filter((h) => h.Event_Name === "FIELD_CHANGE");
    const bankRow = fields.find((h) => h.Field_Name === "Bank_Id");
    assert.equal(bankRow.Old_Value, bank.Bank_Id);
    assert.equal(bankRow.New_Value, otherBank.Bank_Id);
    const teamRow = fields.find((h) => h.Field_Name === "Department_Id");
    assert.equal(teamRow.Old_Value, team.Department_Id);
    assert.equal(teamRow.New_Value, otherBank.Department_Id);
});

test("choosing a bank that does not exist is refused", async () => {
    const t = createTicket({ subject: "Bank missing" });
    const res = await api.patch(`${T}/${t.Ticket_Id}`, tokens.lead, { bankId: "999999999" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "BANK_NOT_FOUND");
    assert.equal(rowOf(t.Ticket_Id).Bank_Id, bank.Bank_Id);
});

test("a priority change re-dates the SLA due date and is recorded", async () => {
    const t = createTicket({ subject: "Priority redate", priority: "P3" });
    const before = rowOf(t.Ticket_Id).Response_Due_Date;
    const res = await api.patch(`${T}/${t.Ticket_Id}`, tokens.lead, { priority: "P1" });
    assert.equal(res.status, 200);
    const afterDue = res.body.data.Response_Due_Date;
    assert.ok(afterDue);
    assert.ok(new Date(afterDue).getTime() < new Date(before).getTime(), "P1 (24h) is due before P3 (240h)");
    const h = historyOf(t.Ticket_Id).find((r) => r.Event_Name === "PRIORITY_CHANGE");
    assert.equal(h.Old_Value, "P3");
    assert.equal(h.New_Value, "P1");
    assert.equal(h.Actor_Agent_Id, lead.Agent_Id);

    // Back to P3 gives the same due date again (same SLA start).
    const back = await api.patch(`${T}/${t.Ticket_Id}`, tokens.lead, { priority: "P3" });
    assert.equal(back.body.data.Response_Due_Date, before);
});

test("a status change does not move the SLA due date", async () => {
    const t = createTicket({ subject: "Status keeps due" });
    const before = rowOf(t.Ticket_Id).Response_Due_Date;
    await api.patch(`${T}/${t.Ticket_Id}`, tokens.member, { status: "On Hold - Client" });
    assert.equal(rowOf(t.Ticket_Id).Response_Due_Date, before);
});

test("an empty update body is refused", async () => {
    const t = createTicket({ subject: "Empty patch" });
    const res = await api.patch(`${T}/${t.Ticket_Id}`, tokens.lead, {});
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
});

test("a Closed ticket cannot be moved back to an open status by PATCH", async () => {
    const t = createTicket({ subject: "Closed stays closed" });
    const close = await api.patch(`${T}/${t.Ticket_Id}`, tokens.lead, { status: "Closed" });
    assert.equal(close.status, 200);
    assert.equal(close.body.data.Clock_State, "STOPPED");

    for (const status of ["Open", "In Progress", "Unassigned", "On Hold - Client"]) {
        const res = await api.patch(`${T}/${t.Ticket_Id}`, tokens.admin, { status });
        assert.equal(res.status, 400, `refused: ${status}`);
        assert.equal(res.body.error.code, "VALIDATION_ERROR");
    }
    const row = rowOf(t.Ticket_Id);
    assert.equal(row.Status, "Closed");
    assert.equal(row.Clock_State, "STOPPED");
});

test("a Closed ticket can still have its properties edited", async () => {
    const t = createTicket({ subject: "Closed properties" });
    await api.patch(`${T}/${t.Ticket_Id}`, tokens.lead, { status: "Closed" });
    const res = await api.patch(`${T}/${t.Ticket_Id}`, tokens.lead, { classification: "Issue" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.Classification, "Issue");
    assert.equal(res.body.data.Status, "Closed");
});

// ---------- delete ----------

test("Team Members and Assistant Team Leads may not delete tickets", async () => {
    const t = createTicket({ subject: "Delete refused" });
    for (const key of ["member", "assistant"]) {
        const res = await api.delete(`${T}/${t.Ticket_Id}`, tokens[key]);
        assert.equal(res.status, 403, key);
        assert.equal(res.body.error.code, "FORBIDDEN");
    }
    assert.equal(rowOf(t.Ticket_Id).Is_Deleted, "N");
});

test("Admin, Manager and Team Lead may delete tickets", async () => {
    for (const key of ["admin", "manager", "lead"]) {
        const t = createTicket({ subject: `Delete by ${key}` });
        const res = await api.delete(`${T}/${t.Ticket_Id}`, tokens[key]);
        assert.equal(res.status, 200, key);
        assert.deepEqual(res.body.data, { deleted: true, ticketId: t.Ticket_Id });
    }
});

test("a deleted ticket leaves every list and answers 404, with a TICKET_DELETED history row", async () => {
    const contact = createContact();
    const t = createTicket({ subject: "Gone ticket xyz", contactId: contact.Contact_Id });
    const del = await api.delete(`${T}/${t.Ticket_Id}`, tokens.lead);
    assert.equal(del.status, 200);

    assert.equal((await api.get(`${T}/${t.Ticket_Id}`, tokens.admin)).status, 404);
    assert.equal((await api.get(`${T}/${t.Ticket_Id}/history`, tokens.admin)).status, 404);
    assert.equal((await api.patch(`${T}/${t.Ticket_Id}`, tokens.admin, { status: "In Progress" })).status, 404);
    assert.equal((await api.delete(`${T}/${t.Ticket_Id}`, tokens.admin)).status, 404);

    const search = await api.get(`${T}?search=${encodeURIComponent("Gone ticket xyz")}`, tokens.admin);
    assert.equal(search.body.paging.total, 0);
    const byContact = await api.get(`${T}?contactId=${contact.Contact_Id}`, tokens.admin);
    assert.equal(byContact.body.paging.total, 0);
    const bankQueue = await api.get(`${T}/queues/bank/${bank.Bank_Id}?limit=100`, tokens.admin);
    assert.ok(!bankQueue.body.data.some((r) => r.Ticket_Id === t.Ticket_Id));

    const row = rowOf(t.Ticket_Id);
    assert.equal(row.Is_Deleted, "Y", "soft delete keeps the row");
    assert.equal(row.Modified_By, lead.Agent_Id);
    const h = historyOf(t.Ticket_Id).filter((r) => r.Event_Name === "TICKET_DELETED");
    assert.equal(h.length, 1);
    assert.equal(h[0].Actor_Agent_Id, lead.Agent_Id);
});
