require("../helpers/env");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupDatabase, getDB } = require("../helpers/db");
const { startApi } = require("../helpers/api");
const { agentWithRole, signIn, supportTeam, bankOf, createTicket, systemAgentId, orgId } = require("../helpers/fixtures");
const env = require("../../src/config/env");
const { ingestMessage } = require("../../src/integrations/gmail/ingestion.engine");
const ticketService = require("../../src/services/ticket.service");
const { computeSlaDueDate } = require("../../src/services/sla/sla.service");
const { toIst } = require("../../src/utils/time");

const MAILBOX = env.google.mailbox;
const HOUR = 60 * 60 * 1000;
const BASE_MS = Date.now() - 6 * 24 * HOUR;

let api;
let team;
let bank;
let lead;
let leadToken;
let member;
let memberToken;
let adminToken;

before(async () => {
    setupDatabase();
    api = await startApi();
    team = supportTeam();
    bank = bankOf(team.Department_Id);
    lead = agentWithRole("TEAM_LEAD", { departmentId: team.Department_Id });
    leadToken = signIn(lead);
    member = agentWithRole("TEAM_MEMBER", { departmentId: team.Department_Id });
    memberToken = signIn(member);
    adminToken = signIn(agentWithRole("ADMIN"));
});
after(() => api.close());

let mailSeq = 0;
const mail = ({ from, subject = "Statement not generated", body = "Please check", inReplyTo = null, offsetHours = 0 }) => {
    mailSeq += 1;
    return {
        gmailMessageId: `gm-${mailSeq}`,
        gmailThreadId: `th-${mailSeq}`,
        messageIdHeader: `<rs-${mailSeq}.${process.pid}@bank.test>`,
        inReplyToHeader: inReplyTo,
        referencesHeader: inReplyTo,
        subject,
        from,
        replyTo: [],
        to: [{ name: null, email: MAILBOX }],
        cc: [],
        sentTime: toIst(BASE_MS + mailSeq * 60 * 1000 + offsetHours * HOUR),
        bodyText: body,
        bodyHtml: null,
        attachments: []
    };
};
const ingest = (normalized) => ingestMessage(normalized, systemAgentId(), MAILBOX, []);

const ticketRow = (ticketId) => getDB().prepare("SELECT * FROM HD_TICKET_MASTER WHERE Ticket_Id = ?").get(ticketId);
const conversationsOf = (ticketId) => getDB().prepare(
    "SELECT * FROM HD_TICKET_CONVERSATION WHERE Ticket_Id = ? AND Is_Deleted = 'N' ORDER BY Sent_Time"
).all(ticketId);
const conversationOfThread = (threadId) => getDB().prepare(
    "SELECT c.* FROM HD_TICKET_CONVERSATION c JOIN HD_TICKET_THREAD t ON t.Conversation_Id = c.Conversation_Id WHERE t.Thread_Id = ?"
).get(threadId);
const historyOf = (ticketId, eventName) => getDB().prepare(
    "SELECT * FROM HD_TICKET_HISTORY WHERE Ticket_Id = ? AND Event_Name = ? ORDER BY Event_Time"
).all(ticketId, eventName);
const reopensOf = (ticketId) => getDB().prepare("SELECT * FROM HD_TICKET_REOPEN WHERE Ticket_Id = ? ORDER BY Reopen_No").all(ticketId);
const metricsOf = (ticketId) => getDB().prepare("SELECT * FROM HD_TICKET_METRICS WHERE Ticket_Id = ?").get(ticketId);
const closeTicket = (ticketId) => ticketService.updateTicket(ticketId, { status: "Closed" }, systemAgentId());

let customerSeq = 0;

/**
 * An email ticket on the support team's bank with priority P2 (so it has an
 * SLA), `withAssignee` puts the team member on it with work Done, then it is
 * Closed. Returns the original mail and the ticket id.
 */
const closedEmailTicket = async ({ withAssignee = false, properties = {} } = {}) => {
    customerSeq += 1;
    const from = { name: "Bank Customer", email: `rs.customer${customerSeq}@bank.test` };
    const original = mail({ from });
    const { ticketId } = await ingest(original);
    ticketService.updateTicket(ticketId, { bankId: bank.Bank_Id, priority: "P2", ...properties }, systemAgentId());
    if (withAssignee) {
        const assigned = await api.post(`/api/v1/tickets/${ticketId}/assignees`, leadToken, { agentIds: [member.Agent_Id] });
        assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
        const done = await api.patch(`/api/v1/tickets/${ticketId}/assignees/${member.Agent_Id}/state`, memberToken, { state: "DONE" });
        assert.equal(done.status, 200, JSON.stringify(done.body));
    }
    closeTicket(ticketId);
    return { original, from, ticketId };
};

const replyAfterClose = (original, from, extra = {}) =>
    ingest(mail({ from, subject: `Re: ${original.subject}`, inReplyTo: original.messageIdHeader, ...extra }));

// ---- Reopen ----

test("reopen records the round, restarts the SLA, releases assignees and returns the ticket to Unassigned", async () => {
    const { original, from, ticketId } = await closedEmailTicket({ withAssignee: true });
    const closed = ticketRow(ticketId);
    assert.equal(closed.Clock_State, "STOPPED");
    assert.ok(closed.Response_Due_Date, "P2 ticket has an SLA due date");
    const reply = await replyAfterClose(original, from);
    const pending = conversationOfThread(reply.threadId);
    assert.equal(pending.Post_Close_Decision, "PENDING");

    const res = await api.post(`/api/v1/tickets/${ticketId}/reopen`, leadToken, { reason: "Customer says the issue is back" });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    const [reopen] = reopensOf(ticketId);
    assert.equal(reopen.Reopen_No, 1);
    assert.equal(reopen.Reason, "Customer says the issue is back");
    assert.equal(reopen.Reopened_By, lead.Agent_Id);
    assert.equal(reopen.Trigger_Conversation_Id, pending.Conversation_Id);
    assert.equal(reopen.Prev_Closed_Time, closed.Closed_Time);
    assert.equal(reopen.Prev_Due_Date, closed.Response_Due_Date);
    assert.equal(reopen.Prev_Sla_Met, closed.Closed_Time <= closed.Response_Due_Date ? "Y" : "N");
    assert.equal(reopen.Closed_Again_Time, null);

    const ticket = ticketRow(ticketId);
    assert.equal(ticket.Status, "Unassigned");
    assert.notEqual(ticket.Clock_State, "STOPPED");
    assert.equal(ticket.Closed_Time, null);
    assert.equal(ticket.Sla_Start_Time, reopen.Reopened_Time, "the SLA starts fresh from the reopen");
    assert.equal(ticket.Response_Due_Date, computeSlaDueDate({ createdTime: reopen.Reopened_Time, priority: "P2", bankId: bank.Bank_Id, orgId: orgId() }));
    assert.notEqual(ticket.Response_Due_Date, closed.Response_Due_Date);

    const openAssignments = getDB().prepare("SELECT COUNT(*) n FROM HD_TICKET_ASSIGNMENT WHERE Ticket_Id = ? AND Released_Time IS NULL").get(ticketId).n;
    assert.equal(openAssignments, 0, "everyone is released");
    assert.equal(historyOf(ticketId, "ASSIGNEE_REMOVED").length, 1);

    assert.equal(metricsOf(ticketId).Reopen_Count, 1);
    const reopened = historyOf(ticketId, "REOPENED");
    assert.equal(reopened.length, 1);
    assert.equal(reopened[0].New_Value, "1");
    assert.equal(reopened[0].Actor_Agent_Id, lead.Agent_Id);
    assert.equal(conversationOfThread(reply.threadId).Post_Close_Decision, "REOPENED");

    const info = await api.get(`/api/v1/tickets/${ticketId}/reopens`, leadToken);
    assert.equal(info.status, 200);
    assert.equal(info.body.data.reopens.length, 1);
    assert.equal(info.body.data.reopens[0].reason, "Customer says the issue is back");
});

test("closing again after a reopen fills Closed_Again_Time, and the next reopen is #2", async () => {
    const { original, from, ticketId } = await closedEmailTicket();
    await replyAfterClose(original, from);
    assert.equal((await api.post(`/api/v1/tickets/${ticketId}/reopen`, leadToken, { reason: "Back again" })).status, 200);

    closeTicket(ticketId);

    const closedAgain = ticketRow(ticketId);
    assert.equal(reopensOf(ticketId)[0].Closed_Again_Time, closedAgain.Closed_Time);

    const second = await api.post(`/api/v1/tickets/${ticketId}/reopen`, leadToken, { reason: "Customer phoned" });
    assert.equal(second.status, 200);
    const rounds = reopensOf(ticketId);
    assert.equal(rounds.length, 2);
    assert.equal(rounds[1].Reopen_No, 2);
    assert.equal(rounds[1].Prev_Closed_Time, closedAgain.Closed_Time);
    assert.equal(rounds[1].Closed_Again_Time, null);
    assert.equal(rounds[0].Closed_Again_Time, closedAgain.Closed_Time, "an earlier round is not touched");
    assert.equal(metricsOf(ticketId).Reopen_Count, 2);
});

test("a manual reopen with no pending mail works but needs a reason", async () => {
    const ticket = createTicket({ subject: "Phoned in" });
    closeTicket(ticket.Ticket_Id);

    const noReason = await api.post(`/api/v1/tickets/${ticket.Ticket_Id}/reopen`, leadToken, {});
    assert.equal(noReason.status, 400);
    const blank = await api.post(`/api/v1/tickets/${ticket.Ticket_Id}/reopen`, leadToken, { reason: "   " });
    assert.equal(blank.status, 400);
    assert.equal(ticketRow(ticket.Ticket_Id).Status, "Closed");

    const res = await api.post(`/api/v1/tickets/${ticket.Ticket_Id}/reopen`, leadToken, { reason: "Customer phoned back" });

    assert.equal(res.status, 200);
    const [reopen] = reopensOf(ticket.Ticket_Id);
    assert.equal(reopen.Trigger_Conversation_Id, null);
    assert.equal(ticketRow(ticket.Ticket_Id).Status, "Unassigned");
});

test("a ticket that is not Closed cannot be reopened", async () => {
    const ticket = createTicket({ subject: "Still open" });
    const res = await api.post(`/api/v1/tickets/${ticket.Ticket_Id}/reopen`, leadToken, { reason: "Nothing to reopen" });
    assert.equal(res.status, 400);
    assert.equal(reopensOf(ticket.Ticket_Id).length, 0);
});

test("a Team Member without tickets.reopen cannot reopen, split or dismiss", async () => {
    const { original, from, ticketId } = await closedEmailTicket();
    const reply = await replyAfterClose(original, from);

    assert.equal((await api.post(`/api/v1/tickets/${ticketId}/reopen`, memberToken, { reason: "I want it back" })).status, 403);
    assert.equal((await api.post(`/api/v1/tickets/${ticketId}/split`, memberToken)).status, 403);
    assert.equal((await api.post(`/api/v1/tickets/${ticketId}/close-replies/dismiss`, memberToken)).status, 403);

    assert.equal(ticketRow(ticketId).Status, "Closed");
    assert.equal(reopensOf(ticketId).length, 0);
    assert.equal(conversationOfThread(reply.threadId).Post_Close_Decision, "PENDING");
});

test("a Team Member cannot reopen a Closed ticket by changing its status", async () => {
    const { ticketId } = await closedEmailTicket();
    const res = await api.patch(`/api/v1/tickets/${ticketId}`, memberToken, { status: "Open" });
    assert.equal(res.status, 400);
    assert.equal(ticketRow(ticketId).Status, "Closed");
});

// ---- New issue (split) ----

test("create as new issue copies the properties, moves the pending and later mails and keeps the old ticket Closed", async () => {
    const { original, from, ticketId } = await closedEmailTicket({
        properties: { classification: "Complaint", category: "Application" }
    });
    const old = ticketRow(ticketId);
    const first = await replyAfterClose(original, from, { body: "New problem: cheque clearing" });
    const second = await replyAfterClose(original, from, { body: "Any update?" });

    const res = await api.post(`/api/v1/tickets/${ticketId}/split`, leadToken);

    assert.equal(res.status, 200, JSON.stringify(res.body));
    const childId = res.body.data.Ticket_Id;
    const child = ticketRow(childId);
    assert.notEqual(childId, ticketId);
    assert.equal(child.Split_From_Ticket_Id, ticketId);
    assert.equal(child.Subject, original.subject, "Re: prefix is dropped");
    assert.equal(child.Description, "New problem: cheque clearing");
    assert.equal(child.Status, "Unassigned");
    assert.equal(child.Priority, old.Priority);
    assert.equal(child.Bank_Id, old.Bank_Id);
    assert.equal(child.Department_Id, old.Department_Id);
    assert.equal(child.Contact_Id, old.Contact_Id);
    assert.equal(child.Classification, "Complaint");
    assert.equal(child.Category, "Application");
    assert.equal(child.Created_Time, conversationOfThread(first.threadId).Sent_Time);
    assert.ok(child.Response_Due_Date, "the new issue gets its own SLA");

    const moved = conversationsOf(childId);
    assert.deepEqual(moved.map((c) => c.Content), ["New problem: cheque clearing", "Any update?"]);
    assert.ok(moved.every((c) => c.Post_Close_Decision === "SPLIT"));
    const left = conversationsOf(ticketId);
    assert.equal(left.length, 1, "the original mail stays");
    assert.equal(left[0].Content, original.bodyText);
    assert.equal(ticketRow(ticketId).Thread_Count, 1);
    assert.equal(child.Thread_Count, 2);
    const threadTickets = getDB().prepare("SELECT Ticket_Id FROM HD_TICKET_THREAD WHERE Thread_Id IN (?, ?)").all(first.threadId, second.threadId);
    assert.ok(threadTickets.every((t) => t.Ticket_Id === childId));

    const splitTo = historyOf(ticketId, "SPLIT_TO");
    assert.equal(splitTo.length, 1);
    assert.equal(splitTo[0].New_Value, childId);
    const splitFrom = historyOf(childId, "SPLIT_FROM");
    assert.equal(splitFrom.length, 1);
    assert.equal(splitFrom[0].New_Value, ticketId);

    const after = ticketRow(ticketId);
    assert.equal(after.Status, "Closed");
    assert.equal(after.Clock_State, "STOPPED");
    assert.equal(reopensOf(ticketId).length, 0, "a split is not a reopen");
    assert.equal(metricsOf(ticketId).Reopen_Count, 0);

    // The lead may change the copied properties on the new issue.
    const edit = await api.patch(`/api/v1/tickets/${childId}`, leadToken, { priority: "P1" });
    assert.equal(edit.status, 200, JSON.stringify(edit.body));
    assert.equal(ticketRow(childId).Priority, "P1");

    // A later mail in the old thread follows the new issue.
    const later = await replyAfterClose(original, from, { body: "Third mail" });
    assert.equal(later.ticketId, childId);

    const info = await api.get(`/api/v1/tickets/${ticketId}/reopens`, leadToken);
    assert.deepEqual(info.body.data.splitInto.map((t) => t.Ticket_Id), [childId]);
});

test("create as new issue needs a pending reply", async () => {
    const { ticketId } = await closedEmailTicket();
    const res = await api.post(`/api/v1/tickets/${ticketId}/split`, leadToken);
    assert.equal(res.status, 400);
    assert.equal(getDB().prepare("SELECT COUNT(*) n FROM HD_TICKET_MASTER WHERE Split_From_Ticket_Id = ?").get(ticketId).n, 0);
});

// ---- No action ----

test("no action marks pending mails DISMISSED and the ticket stays Closed", async () => {
    const { original, from, ticketId } = await closedEmailTicket();
    const a = await replyAfterClose(original, from, { body: "Thanks!" });
    const b = await replyAfterClose(original, from, { body: "Thanks again" });
    const closed = ticketRow(ticketId);

    const res = await api.post(`/api/v1/tickets/${ticketId}/close-replies/dismiss`, leadToken);

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(conversationOfThread(a.threadId).Post_Close_Decision, "DISMISSED");
    assert.equal(conversationOfThread(b.threadId).Post_Close_Decision, "DISMISSED");
    const ticket = ticketRow(ticketId);
    assert.equal(ticket.Status, "Closed");
    assert.equal(ticket.Clock_State, "STOPPED");
    assert.equal(ticket.Closed_Time, closed.Closed_Time);
    assert.equal(ticket.Response_Due_Date, closed.Response_Due_Date);
    const dismissed = historyOf(ticketId, "CLOSE_REPLY_DISMISSED");
    assert.equal(dismissed.length, 1);
    assert.equal(dismissed[0].New_Value, "2");
    assert.equal(reopensOf(ticketId).length, 0);
    assert.equal(metricsOf(ticketId).Reopen_Count, 0);

    const again = await api.post(`/api/v1/tickets/${ticketId}/close-replies/dismiss`, leadToken);
    assert.equal(again.status, 400, "nothing left to dismiss");
});

test("an Admin can also decide on a reply after close", async () => {
    const { original, from, ticketId } = await closedEmailTicket();
    await replyAfterClose(original, from);
    const res = await api.post(`/api/v1/tickets/${ticketId}/close-replies/dismiss`, adminToken);
    assert.equal(res.status, 200);
});
