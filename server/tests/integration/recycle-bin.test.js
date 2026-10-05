require("../helpers/env");
const fs = require("fs");
const path = require("path");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupDatabase, getDB } = require("../helpers/db");
const { startApi } = require("../helpers/api");
const { agentWithRole, signIn, supportTeam, createTicket, orgId, systemAgentId } = require("../helpers/fixtures");
const recycleBinService = require("../../src/services/recycle-bin.service");
const gmailIngested = require("../../src/repositories/gmail-ingested-message.repository");
const { toIst, nowIst } = require("../../src/utils/time");
const env = require("../../src/config/env");

const T = "/api/v1/tickets";
const BIN = `${T}/recycle-bin`;
const DAY_MS = 24 * 60 * 60 * 1000;

let api;
let team;
let lead;
let member;
let assistant;
const tokens = {};

/** No Assistant Team Lead is seeded - promote a seeded Team Member in this test DB. */
const makeAssistantTeamLead = (exclude) => {
    const db = getDB();
    const agent = agentWithRole("TEAM_MEMBER", { departmentId: team.Department_Id, exclude });
    const roleId = db.prepare("SELECT Role_Id FROM HD_ROLE_MASTER WHERE Role_Key = 'ASSISTANT_TEAM_LEAD'").get().Role_Id;
    db.prepare("UPDATE HD_AGENT_MASTER SET Role_Id = ? WHERE Agent_Id = ?").run(roleId, agent.Agent_Id);
    return agent;
};

const binIds = async () => (await api.get(BIN, tokens.lead)).body.data.tickets.map((t) => t.Ticket_Id);

const deleteViaApi = async (ticketId) => {
    const res = await api.delete(`${T}/${ticketId}`, tokens.lead);
    assert.equal(res.status, 200);
};

/** Moves the ticket's TICKET_DELETED history back so it looks deleted `days` ago. */
const backdateDelete = (ticketId, days) => {
    getDB().prepare("UPDATE HD_TICKET_HISTORY SET Event_Time = ? WHERE Ticket_Id = ? AND Event_Name = 'TICKET_DELETED'")
        .run(toIst(Date.now() - days * DAY_MS), ticketId);
};

const ticketRow = (ticketId) => getDB().prepare("SELECT * FROM HD_TICKET_MASTER WHERE Ticket_Id = ?").get(ticketId);

// Every table with a Ticket_Id column pointing at HD_TICKET_MASTER.
const CHILD_TABLES = [
    "HD_TICKET_CONVERSATION", "HD_TICKET_THREAD", "HD_TICKET_COMMENT", "HD_TICKET_HISTORY", "HD_TICKET_METRICS",
    "_GMAIL_INGESTED_MESSAGE", "HD_TICKET_ATTACHMENT", "HD_TICKET_CLOCK_SEGMENT", "HD_TICKET_ESCALATION",
    "HD_TICKET_ASSIGNMENT", "HD_ASSIGNMENT_STATE_LOG", "HD_ASSIGNMENT_DEPENDENCY", "HD_TICKET_WORKLOG",
    "HD_TICKET_REOPEN", "HD_HOLIDAY_WORK"
];

const childCounts = (ticketId) => Object.fromEntries(CHILD_TABLES.map((table) => [
    table, getDB().prepare(`SELECT COUNT(*) n FROM ${table} WHERE Ticket_Id = ?`).get(ticketId).n
]));

let rowSeq = 0;
/**
 * Gives a ticket a row in every child table (straight SQL - the service
 * paths for mail, assignment and work tracking are heavy) plus a file on
 * disk for its attachment. Returns the Gmail message id and file path.
 */
const addChildRows = (ticketId) => {
    const db = getDB();
    const org = orgId();
    const actor = systemAgentId();
    const now = nowIst();
    const id = (prefix) => `${prefix}-${ticketId}-${(rowSeq += 1)}`;
    const conv = id("CONV");
    const thread = id("THR");
    const gmailId = id("GMAIL");
    const a1 = id("ASG");
    const a2 = id("ASG");
    const storagePath = `${ticketId}/${id("FILE")}.txt`;

    db.prepare(`INSERT INTO HD_TICKET_CONVERSATION (Conversation_Id, Ticket_Id, Direction, Content, Sent_Time, Created_By, Org_Id)
                VALUES (?, ?, 'in', 'Hello', ?, ?, ?)`).run(conv, ticketId, now, actor, org);
    db.prepare(`INSERT INTO HD_TICKET_THREAD (Thread_Id, Ticket_Id, Conversation_Id, Message_Id_Header, Direction, Created_By, Org_Id)
                VALUES (?, ?, ?, ?, 'in', ?, ?)`).run(thread, ticketId, conv, `<${thread}@mail.test>`, actor, org);
    db.prepare("INSERT INTO _GMAIL_INGESTED_MESSAGE (Gmail_Message_Id, Ticket_Id, Thread_Id, Created_Time) VALUES (?, ?, ?, ?)")
        .run(gmailId, ticketId, thread, now);
    db.prepare(`INSERT INTO HD_TICKET_COMMENT (Comment_Id, Ticket_Id, Commenter_Agent_Id, Content, Commented_Time, Created_By, Org_Id)
                VALUES (?, ?, ?, 'Note', ?, ?, ?)`).run(id("CMT"), ticketId, lead.Agent_Id, now, actor, org);
    db.prepare(`INSERT INTO HD_TICKET_ATTACHMENT (Attachment_Id, Ticket_Id, Conversation_Id, File_Name, Storage_Path, Uploaded_Time, Created_By, Org_Id)
                VALUES (?, ?, ?, 'log.txt', ?, ?, ?, ?)`).run(id("ATT"), ticketId, conv, storagePath, now, actor, org);
    db.prepare(`INSERT INTO HD_TICKET_CLOCK_SEGMENT (Segment_Id, Ticket_Id, Started_Time, Ended_Time, Status_At_Start, Status_At_End, Created_By, Org_Id)
                VALUES (?, ?, ?, ?, 'In Progress', 'On Hold - Client', ?, ?)`).run(id("SEG"), ticketId, now, now, actor, org);
    db.prepare("INSERT INTO HD_TICKET_ESCALATION (Ticket_Escalation_Id, Ticket_Id, Level_No, Trigger_Time, Org_Id) VALUES (?, ?, 99, ?, ?)")
        .run(id("ESC"), ticketId, now, org);
    for (const [assignmentId, agentId] of [[a1, lead.Agent_Id], [a2, member.Agent_Id]]) {
        db.prepare(`INSERT INTO HD_TICKET_ASSIGNMENT (Assignment_Id, Ticket_Id, Agent_Id, Department_Id, Assigned_By, Assigned_Time, Work_State, Org_Id)
                    VALUES (?, ?, ?, ?, ?, ?, 'IN_PROGRESS', ?)`).run(assignmentId, ticketId, agentId, team.Department_Id, lead.Agent_Id, now, org);
        db.prepare(`INSERT INTO HD_ASSIGNMENT_STATE_LOG (State_Log_Id, Assignment_Id, Ticket_Id, Work_State, Started_Time, Actor_Agent_Id, Org_Id)
                    VALUES (?, ?, ?, 'IN_PROGRESS', ?, ?, ?)`).run(id("LOG"), assignmentId, ticketId, now, lead.Agent_Id, org);
    }
    db.prepare(`INSERT INTO HD_ASSIGNMENT_DEPENDENCY (Dependency_Id, Ticket_Id, Assignment_Id, Depends_On_Assignment_Id, Created_By, Created_Time, Org_Id)
                VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id("DEP"), ticketId, a1, a2, lead.Agent_Id, now, org);
    db.prepare(`INSERT INTO HD_TICKET_WORKLOG (Worklog_Id, Ticket_Id, Assignment_Id, Agent_Id, Minutes, Work_Date, Logged_By, Logged_Time, Org_Id)
                VALUES (?, ?, ?, ?, 30, ?, ?, ?, ?)`).run(id("WL"), ticketId, a2, member.Agent_Id, now.slice(0, 10), member.Agent_Id, now, org);
    db.prepare(`INSERT INTO HD_TICKET_REOPEN (Reopen_Id, Ticket_Id, Reopen_No, Reason, Trigger_Conversation_Id, Reopened_By, Reopened_Time, Org_Id)
                VALUES (?, ?, 1, 'Customer wrote again', ?, ?, ?, ?)`).run(id("RO"), ticketId, conv, lead.Agent_Id, now, org);
    db.prepare(`INSERT INTO HD_HOLIDAY_WORK (Holiday_Work_Id, Ticket_Id, Agent_Id, Holiday_Date, Started_Time, Ended_Time, Minutes, Created_By, Org_Id)
                VALUES (?, ?, ?, ?, ?, ?, 10, ?, ?)`).run(id("HW"), ticketId, member.Agent_Id, now.slice(0, 10), now, now, actor, org);

    const filePath = path.join(env.attachmentsDir, storagePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "attachment bytes");
    return { gmailId, filePath };
};

before(async () => {
    setupDatabase();
    api = await startApi();
    team = supportTeam();
    lead = agentWithRole("TEAM_LEAD", { departmentId: team.Department_Id });
    member = agentWithRole("TEAM_MEMBER", { departmentId: team.Department_Id });
    assistant = makeAssistantTeamLead([member.Agent_Id]);
    tokens.lead = signIn(lead);
    tokens.member = signIn(member);
    tokens.assistant = signIn(assistant);
    tokens.manager = signIn(agentWithRole("MANAGER"));
});
after(() => api.close());

test("the recycle bin needs tickets.delete - Team Member and Assistant Team Lead are refused", async () => {
    const t = createTicket({ subject: "Bin permission" });
    await deleteViaApi(t.Ticket_Id);
    for (const key of ["member", "assistant"]) {
        const list = await api.get(BIN, tokens[key]);
        assert.equal(list.status, 403, `${key} list`);
        assert.equal(list.body.error.code, "FORBIDDEN");
        const restore = await api.post(`${T}/${t.Ticket_Id}/restore`, tokens[key]);
        assert.equal(restore.status, 403, `${key} restore`);
    }
    assert.equal(ticketRow(t.Ticket_Id).Is_Deleted, "Y");
    assert.equal((await api.get(BIN, tokens.manager)).status, 200);
});

test("a deleted ticket is listed with who deleted it, when, and when it will be purged", async () => {
    const t = createTicket({ subject: "Bin listed" });
    await deleteViaApi(t.Ticket_Id);

    const res = await api.get(BIN, tokens.lead);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.retentionDays, 30);
    const row = res.body.data.tickets.find((r) => r.Ticket_Id === t.Ticket_Id);
    assert.ok(row, "ticket is in the bin");
    assert.equal(row.Ticket_Number, t.Ticket_Number);
    assert.equal(row.Subject, "Bin listed");
    assert.equal(row.Deleted_By, lead.Agent_Id);
    assert.equal(row.Deleted_By_Name, [lead.First_Name, lead.Last_Name].filter(Boolean).join(" "));

    const history = getDB().prepare("SELECT Event_Time FROM HD_TICKET_HISTORY WHERE Ticket_Id = ? AND Event_Name = 'TICKET_DELETED'").get(t.Ticket_Id);
    assert.equal(row.Deleted_Time, history.Event_Time);
    assert.equal(new Date(row.Purge_Time).getTime() - new Date(row.Deleted_Time).getTime(), 30 * DAY_MS);
    assert.match(row.Purge_Time, /\+05:30$/);
    assert.equal(row.Days_Left, 30);
});

test("the bin lists the newest delete first and shows days left", async () => {
    const older = createTicket({ subject: "Bin older" });
    const newer = createTicket({ subject: "Bin newer" });
    await deleteViaApi(older.Ticket_Id);
    await deleteViaApi(newer.Ticket_Id);
    backdateDelete(older.Ticket_Id, 10);

    const tickets = (await api.get(BIN, tokens.lead)).body.data.tickets;
    const ids = tickets.map((r) => r.Ticket_Id);
    assert.ok(ids.indexOf(newer.Ticket_Id) < ids.indexOf(older.Ticket_Id));
    assert.equal(tickets.find((r) => r.Ticket_Id === older.Ticket_Id).Days_Left, 20);
});

test("restoring puts the ticket back on the lists and records TICKET_RESTORED", async () => {
    const t = createTicket({ subject: "Bin restore me" });
    await deleteViaApi(t.Ticket_Id);
    assert.equal((await api.get(`${T}/${t.Ticket_Id}`, tokens.lead)).status, 404);

    const res = await api.post(`${T}/${t.Ticket_Id}/restore`, tokens.lead);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { restored: true, ticketId: t.Ticket_Id });

    const detail = await api.get(`${T}/${t.Ticket_Id}`, tokens.lead);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.Ticket_Number, t.Ticket_Number);
    const list = await api.get(`${T}?search=${encodeURIComponent("Bin restore me")}`, tokens.lead);
    assert.equal(list.body.paging.total, 1);
    assert.ok(!(await binIds()).includes(t.Ticket_Id));

    const restored = getDB().prepare("SELECT * FROM HD_TICKET_HISTORY WHERE Ticket_Id = ? AND Event_Name = 'TICKET_RESTORED'").all(t.Ticket_Id);
    assert.equal(restored.length, 1);
    assert.equal(restored[0].Actor_Agent_Id, lead.Agent_Id);
});

test("restoring a live ticket or an unknown ticket answers 404", async () => {
    const t = createTicket({ subject: "Bin live" });
    const live = await api.post(`${T}/${t.Ticket_Id}/restore`, tokens.lead);
    assert.equal(live.status, 404);
    assert.equal(live.body.error.code, "TICKET_NOT_FOUND");
    assert.equal((await api.post(`${T}/999999999/restore`, tokens.lead)).status, 404);

    // Restored once already: a second restore finds nothing in the bin.
    await deleteViaApi(t.Ticket_Id);
    assert.equal((await api.post(`${T}/${t.Ticket_Id}/restore`, tokens.lead)).status, 200);
    assert.equal((await api.post(`${T}/${t.Ticket_Id}/restore`, tokens.lead)).status, 404);
});

test("a ticket deleted again after a restore is listed once, with the latest delete", async () => {
    const t = createTicket({ subject: "Bin twice" });
    await deleteViaApi(t.Ticket_Id);
    backdateDelete(t.Ticket_Id, 5);
    assert.equal((await api.post(`${T}/${t.Ticket_Id}/restore`, tokens.lead)).status, 200);
    await deleteViaApi(t.Ticket_Id);

    const rows = (await api.get(BIN, tokens.lead)).body.data.tickets.filter((r) => r.Ticket_Id === t.Ticket_Id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].Days_Left, 30);
});

test("restoring after the retention window answers 409 RESTORE_PERIOD_EXPIRED", async () => {
    const t = createTicket({ subject: "Bin expired" });
    await deleteViaApi(t.Ticket_Id);
    backdateDelete(t.Ticket_Id, 31);

    const row = (await api.get(BIN, tokens.lead)).body.data.tickets.find((r) => r.Ticket_Id === t.Ticket_Id);
    assert.equal(row.Days_Left, 0);
    const res = await api.post(`${T}/${t.Ticket_Id}/restore`, tokens.lead);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, "RESTORE_PERIOD_EXPIRED");
    assert.equal(ticketRow(t.Ticket_Id).Is_Deleted, "Y");
});

test("a ticket hidden by the Gmail deletion sync is not in the bin and is never purged", async () => {
    const t = createTicket({ subject: "Bin gmail hidden" });
    const old = toIst(Date.now() - 90 * DAY_MS);
    getDB().prepare("UPDATE HD_TICKET_MASTER SET Is_Deleted = 'Y', Created_Time = ? WHERE Ticket_Id = ?").run(old, t.Ticket_Id);

    assert.ok(!(await binIds()).includes(t.Ticket_Id));
    assert.equal((await api.post(`${T}/${t.Ticket_Id}/restore`, tokens.lead)).status, 404);

    recycleBinService.purgeExpired();
    assert.ok(ticketRow(t.Ticket_Id), "row is still there");
    assert.equal(ticketRow(t.Ticket_Id).Is_Deleted, "Y");
});

test("purge removes expired tickets with every child row and keeps the rest", async () => {
    const db = getDB();
    const parent = createTicket({ subject: "Purge parent" });
    const child = createTicket({ subject: "Purge split child", splitFromTicketId: parent.Ticket_Id });
    const live = createTicket({ subject: "Purge live" });
    const recent = createTicket({ subject: "Purge recent delete" });
    const { gmailId, filePath } = addChildRows(parent.Ticket_Id);
    const liveChild = addChildRows(live.Ticket_Id);
    const liveCountsBefore = childCounts(live.Ticket_Id);

    for (const count of Object.values(childCounts(parent.Ticket_Id))) assert.ok(count > 0);
    assert.ok(fs.existsSync(filePath));
    assert.equal(ticketRow(child.Ticket_Id).Split_From_Ticket_Id, parent.Ticket_Id);

    await deleteViaApi(parent.Ticket_Id);
    await deleteViaApi(recent.Ticket_Id);
    backdateDelete(parent.Ticket_Id, 31);
    backdateDelete(recent.Ticket_Id, 29);

    const result = recycleBinService.purgeExpired();
    assert.ok(result.purged >= 1);

    assert.equal(ticketRow(parent.Ticket_Id), undefined, "ticket row is gone");
    for (const [table, count] of Object.entries(childCounts(parent.Ticket_Id))) {
        assert.equal(count, 0, `${table} rows removed`);
    }
    assert.equal(fs.existsSync(filePath), false, "attachment file removed");
    assert.equal(fs.existsSync(path.dirname(filePath)), false, "empty ticket folder removed");

    // Its mails stay in Gmail, so the sync must keep skipping them.
    assert.equal(gmailIngested.findByGmailMessageId(gmailId), undefined);
    const purgedRow = db.prepare("SELECT * FROM _GMAIL_PURGED_MESSAGE WHERE Gmail_Message_Id = ?").get(gmailId);
    assert.equal(purgedRow.Ticket_Number, parent.Ticket_Number);
    assert.equal(gmailIngested.isProcessed(gmailId), true);

    const splitChild = ticketRow(child.Ticket_Id);
    assert.equal(splitChild.Is_Deleted, "N");
    assert.equal(splitChild.Split_From_Ticket_Id, null);

    assert.equal(ticketRow(live.Ticket_Id).Is_Deleted, "N");
    assert.deepEqual(childCounts(live.Ticket_Id), liveCountsBefore);
    assert.ok(fs.existsSync(liveChild.filePath));
    assert.equal(gmailIngested.isProcessed(liveChild.gmailId), true);

    assert.equal(ticketRow(recent.Ticket_Id).Is_Deleted, "Y", "inside the window it stays in the bin");
    assert.ok((await binIds()).includes(recent.Ticket_Id));
    assert.ok(!(await binIds()).includes(parent.Ticket_Id));

    assert.deepEqual(db.pragma("foreign_key_check"), []);
});

test("a ticket restored before the purge is kept even if first deleted long ago", async () => {
    const t = createTicket({ subject: "Purge restored" });
    await deleteViaApi(t.Ticket_Id);
    backdateDelete(t.Ticket_Id, 20);
    assert.equal((await api.post(`${T}/${t.Ticket_Id}/restore`, tokens.lead)).status, 200);
    backdateDelete(t.Ticket_Id, 60);

    recycleBinService.purgeExpired();
    assert.equal(ticketRow(t.Ticket_Id).Is_Deleted, "N");
});

test("a purged ticket's number is never reused", async () => {
    const t = createTicket({ subject: "Purge highest number" });
    const highest = getDB().prepare("SELECT MAX(CAST(Ticket_Number AS INTEGER)) n FROM HD_TICKET_MASTER").get().n;
    assert.equal(Number(t.Ticket_Number), highest);
    await deleteViaApi(t.Ticket_Id);
    backdateDelete(t.Ticket_Id, 40);
    recycleBinService.purgeExpired();
    assert.equal(ticketRow(t.Ticket_Id), undefined);

    const next = createTicket({ subject: "After purge" });
    assert.equal(Number(next.Ticket_Number), Number(t.Ticket_Number) + 1);
    assert.match(next.Ticket_Number, /^\d{6}$/);
});
