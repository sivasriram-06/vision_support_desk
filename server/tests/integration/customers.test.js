require("../helpers/env");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupDatabase, getDB } = require("../helpers/db");
const { startApi } = require("../helpers/api");
const { agentWithRole, signIn, supportTeam, bankOf, createContact, createTicket } = require("../helpers/fixtures");
const ticketService = require("../../src/services/ticket.service");
const { toIst } = require("../../src/utils/time");

const C = "/api/v1/customers";
const HOUR_MS = 60 * 60 * 1000;

let api;
let team;
let bank;
let otherBank;
let lead;
const tokens = {};

/** No Assistant Team Lead is seeded - promote a seeded Team Member in this test DB. */
const makeAssistantTeamLead = (exclude) => {
    const db = getDB();
    const agent = agentWithRole("TEAM_MEMBER", { departmentId: team.Department_Id, exclude });
    const roleId = db.prepare("SELECT Role_Id FROM HD_ROLE_MASTER WHERE Role_Key = 'ASSISTANT_TEAM_LEAD'").get().Role_Id;
    db.prepare("UPDATE HD_AGENT_MASTER SET Role_Id = ? WHERE Agent_Id = ?").run(roleId, agent.Agent_Id);
    return agent;
};

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
        "SELECT * FROM HD_BANK_MASTER WHERE Bank_Id <> ? AND Is_Deleted = 'N' ORDER BY Bank_Id LIMIT 1"
    ).get(bank.Bank_Id);
    lead = agentWithRole("TEAM_LEAD", { departmentId: team.Department_Id });
    tokens.admin = signIn(agentWithRole("ADMIN"));
    tokens.lead = signIn(lead);
    const member = agentWithRole("TEAM_MEMBER", { departmentId: team.Department_Id });
    tokens.member = signIn(member);
    tokens.assistant = signIn(makeAssistantTeamLead([member.Agent_Id]));
});
after(() => api.close());

test("the Customers page needs customers.manage - a Team Member is refused", async () => {
    const contact = createContact();
    for (const [method, path, body] of [
        ["get", C],
        ["get", `${C}/${contact.Contact_Id}`],
        ["patch", `${C}/${contact.Contact_Id}`, { name: "Not Allowed" }]
    ]) {
        const res = await api[method](path, tokens.member, body);
        assert.equal(res.status, 403, `${method} ${path}`);
        assert.equal(res.body.error.code, "FORBIDDEN");
    }
});

test("Admin, Team Lead and Assistant Team Lead can open the Customers page", async () => {
    for (const key of ["admin", "lead", "assistant"]) {
        const res = await api.get(C, tokens[key]);
        assert.equal(res.status, 200, key);
        assert.ok(Array.isArray(res.body.data));
        assert.ok(res.body.paging);
    }
});

test("customer list searches name and email and returns ticket counts", async () => {
    const contact = createContact({ firstName: "Quill", lastName: "Searchable", email: "quill.searchable@bank.test" });
    createTicket({ contactId: contact.Contact_Id });
    createTicket({ contactId: contact.Contact_Id });

    const byName = await api.get(`${C}?search=Searchable`, tokens.lead);
    assert.equal(byName.status, 200);
    assert.equal(byName.body.paging.total, 1);
    const row = byName.body.data[0];
    assert.equal(row.Contact_Id, contact.Contact_Id);
    assert.equal(row.Full_Name, "Quill Searchable");
    assert.equal(row.Email, "quill.searchable@bank.test");
    assert.equal(row.Total_Tickets, 2);
    assert.equal(row.Open_Tickets, 2);
    assert.equal(row.Closed_Tickets, 0);

    const byEmail = await api.get(`${C}?search=quill.searchable@`, tokens.lead);
    assert.deepEqual(byEmail.body.data.map((r) => r.Contact_Id), [contact.Contact_Id]);

    const none = await api.get(`${C}?search=nobody-matches-this`, tokens.lead);
    assert.equal(none.body.paging.total, 0);
    assert.deepEqual(none.body.data, []);
});

test("customer list pages and filters by bank", async () => {
    const withBank = createContact({ lastName: "Banked One" });
    const noBank = createContact({ lastName: "Unbanked One" });
    const set = await api.patch(`${C}/${withBank.Contact_Id}`, tokens.lead, { bankId: otherBank.Bank_Id });
    assert.equal(set.status, 200);

    const byBank = await api.get(`${C}?bankId=${otherBank.Bank_Id}`, tokens.lead);
    assert.ok(byBank.body.data.some((r) => r.Contact_Id === withBank.Contact_Id));
    assert.ok(byBank.body.data.every((r) => r.Bank_Id === otherBank.Bank_Id));
    assert.ok(!byBank.body.data.some((r) => r.Contact_Id === noBank.Contact_Id));

    const withoutBank = await api.get(`${C}?bankId=none&limit=100`, tokens.lead);
    assert.ok(withoutBank.body.data.some((r) => r.Contact_Id === noBank.Contact_Id));
    assert.ok(withoutBank.body.data.every((r) => r.Bank_Id === null));

    const page = await api.get(`${C}?limit=1&page=1`, tokens.lead);
    assert.equal(page.body.data.length, 1);
    assert.equal(page.body.paging.limit, 1);
    assert.equal(page.body.paging.hasMore, true);
});

test("customer detail counts match the ticket list for each state", async () => {
    const contact = createContact({ lastName: "Counted" });
    const open = createTicket({ contactId: contact.Contact_Id, subject: "Count open" });
    const overdue = createTicket({ contactId: contact.Contact_Id, subject: "Count overdue" });
    const closed = createTicket({ contactId: contact.Contact_Id, subject: "Count closed" });
    const closedLate = createTicket({ contactId: contact.Contact_Id, subject: "Count closed late" });
    const deleted = createTicket({ contactId: contact.Contact_Id, subject: "Count deleted" });
    setDueDate(open.Ticket_Id, 48 * HOUR_MS);
    setDueDate(overdue.Ticket_Id, -2 * HOUR_MS);
    ticketService.updateTicket(closed.Ticket_Id, { status: "Closed" }, lead.Agent_Id);
    ticketService.updateTicket(closedLate.Ticket_Id, { status: "Closed" }, lead.Agent_Id);
    setDueDate(closedLate.Ticket_Id, -2 * HOUR_MS);
    assert.equal((await api.delete(`/api/v1/tickets/${deleted.Ticket_Id}`, tokens.lead)).status, 200);

    const res = await api.get(`${C}/${contact.Contact_Id}`, tokens.lead);
    assert.equal(res.status, 200);
    const c = res.body.data;
    assert.equal(c.Total_Tickets, 4, "deleted tickets are not counted");
    assert.equal(c.Open_Tickets, 2);
    assert.equal(c.Closed_Tickets, 2);
    assert.equal(c.Overdue_Tickets, 1, "a closed ticket past its due date is not overdue");

    const total = async (qs) => (await api.get(`/api/v1/tickets?contactId=${contact.Contact_Id}${qs}`, tokens.lead)).body.paging.total;
    assert.equal(await total(""), c.Total_Tickets);
    assert.equal(await total("&state=open"), c.Open_Tickets);
    assert.equal(await total("&state=closed"), c.Closed_Tickets);
    assert.equal(await total("&state=overdue"), c.Overdue_Tickets);

    const listRow = (await api.get(`${C}?search=${encodeURIComponent(contact.Email)}`, tokens.lead)).body.data[0];
    for (const key of ["Total_Tickets", "Open_Tickets", "Closed_Tickets", "Overdue_Tickets"]) {
        assert.equal(listRow[key], c[key], `list ${key} equals detail`);
    }
});

test("an unknown customer answers 404", async () => {
    const res = await api.get(`${C}/999999999`, tokens.lead);
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "CONTACT_NOT_FOUND");
    const patch = await api.patch(`${C}/999999999`, tokens.lead, { name: "Ghost" });
    assert.equal(patch.status, 404);
});

test("editing a customer's name splits it into first and last name", async () => {
    const contact = createContact();
    const res = await api.patch(`${C}/${contact.Contact_Id}`, tokens.lead, { name: "  Asha   Rao Kumar " });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.First_Name, "Asha");
    assert.equal(res.body.data.Last_Name, "Rao Kumar");
    assert.equal(res.body.data.Full_Name, "Asha Rao Kumar");

    const single = await api.patch(`${C}/${contact.Contact_Id}`, tokens.lead, { name: "Mononym" });
    assert.equal(single.body.data.First_Name, null);
    assert.equal(single.body.data.Last_Name, "Mononym");

    const row = getDB().prepare("SELECT Modified_By FROM HD_CONTACT_MASTER WHERE Contact_Id = ?").get(contact.Contact_Id);
    assert.equal(row.Modified_By, lead.Agent_Id);
});

test("editing a customer's bank sets and clears it, and the bank must exist", async () => {
    const contact = createContact();
    const set = await api.patch(`${C}/${contact.Contact_Id}`, tokens.lead, { bankId: bank.Bank_Id });
    assert.equal(set.status, 200);
    assert.equal(set.body.data.Bank_Id, bank.Bank_Id);
    assert.equal(set.body.data.Bank_Name, bank.Bank_Name);

    const missing = await api.patch(`${C}/${contact.Contact_Id}`, tokens.lead, { bankId: "999999999" });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error.code, "BANK_NOT_FOUND");
    assert.equal((await api.get(`${C}/${contact.Contact_Id}`, tokens.lead)).body.data.Bank_Id, bank.Bank_Id);

    const cleared = await api.patch(`${C}/${contact.Contact_Id}`, tokens.lead, { bankId: null });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.Bank_Id, null);
});

test("a customer's email cannot be edited", async () => {
    const contact = createContact();
    const onlyEmail = await api.patch(`${C}/${contact.Contact_Id}`, tokens.lead, { email: "changed@bank.test" });
    assert.equal(onlyEmail.status, 400);
    assert.equal(onlyEmail.body.error.code, "VALIDATION_ERROR");

    const withName = await api.patch(`${C}/${contact.Contact_Id}`, tokens.lead, { name: "Kept Email", email: "changed@bank.test" });
    assert.equal(withName.status, 200);
    assert.equal(withName.body.data.Email, contact.Email);
    assert.equal(getDB().prepare("SELECT Email FROM HD_CONTACT_MASTER WHERE Contact_Id = ?").get(contact.Contact_Id).Email, contact.Email);
});

test("an empty customer name is refused", async () => {
    const contact = createContact();
    const res = await api.patch(`${C}/${contact.Contact_Id}`, tokens.lead, { name: "   " });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
});
