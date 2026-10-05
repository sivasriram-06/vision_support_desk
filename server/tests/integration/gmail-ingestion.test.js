require("../helpers/env");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupDatabase, getDB } = require("../helpers/db");
const { startApi } = require("../helpers/api");
const { agentWithRole, signIn, createContact, systemAgentId } = require("../helpers/fixtures");
const env = require("../../src/config/env");
const gmailClient = require("../../src/integrations/gmail/gmail.client");
const { ingestMessage, runSync } = require("../../src/integrations/gmail/ingestion.engine");
const { runDeletionSync } = require("../../src/integrations/gmail/deletion-sync");
const gmailIngestedRepository = require("../../src/repositories/gmail-ingested-message.repository");
const ticketService = require("../../src/services/ticket.service");
const { toIst } = require("../../src/utils/time");

const MAILBOX = env.google.mailbox;
const HOUR = 60 * 60 * 1000;
const BASE_MS = Date.now() - 5 * 24 * HOUR;

let api;
let adminToken;
let admin;

before(async () => {
    setupDatabase();
    api = await startApi();
    admin = agentWithRole("ADMIN");
    adminToken = signIn(admin);
});
after(() => api.close());

let mailSeq = 0;

/** A normalized message (gmail.normalizer.js shape) - no Gmail call needed. */
const mail = ({ from, subject = "Card switch down", body = "Please help", inReplyTo = null, references = null, sentMs, to = null, messageId = null } = {}) => {
    mailSeq += 1;
    return {
        gmailMessageId: `gm-${mailSeq}`,
        gmailThreadId: `th-${mailSeq}`,
        messageIdHeader: messageId || `<msg-${mailSeq}.${process.pid}@bank.test>`,
        inReplyToHeader: inReplyTo,
        referencesHeader: references,
        subject,
        from: from || { name: "Bank User", email: `sender${mailSeq}@bank.test` },
        replyTo: [],
        to: to || [{ name: null, email: MAILBOX }],
        cc: [],
        sentTime: toIst(sentMs ?? BASE_MS + mailSeq * 60 * 1000),
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
const historyOf = (ticketId, eventName) => getDB().prepare(
    "SELECT * FROM HD_TICKET_HISTORY WHERE Ticket_Id = ? AND Event_Name = ?"
).all(ticketId, eventName);
const countRows = (table) => getDB().prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
const closeTicket = (ticketId) => ticketService.updateTicket(ticketId, { status: "Closed" }, systemAgentId());

/** Raw Gmail API message (format=full) for the runSync / deletion-sync stubs. */
const rawMessage = ({ id, fromHeader, subject, messageId, inReplyTo, internalDate, body }) => ({
    id,
    threadId: id,
    internalDate: String(internalDate),
    payload: {
        mimeType: "text/plain",
        headers: [
            { name: "From", value: fromHeader },
            { name: "To", value: MAILBOX },
            { name: "Subject", value: subject },
            { name: "Message-ID", value: messageId },
            ...(inReplyTo ? [{ name: "In-Reply-To", value: inReplyTo }] : [])
        ],
        body: { data: Buffer.from(body).toString("base64") }
    }
});

/** Fake Gmail client: messages.list returns `listIds`, messages.get serves `byId`. */
const fakeGmail = (listIds, byId = {}) => {
    const calls = { get: [] };
    const client = {
        users: {
            messages: {
                list: async () => ({ data: { messages: listIds.map((id) => ({ id })) } }),
                get: async ({ id }) => {
                    calls.get.push(id);
                    return { data: byId[id] };
                },
                attachments: { get: async () => ({ data: { data: "" } }) }
            }
        }
    };
    return { client, calls };
};

/** Runs fn with gmailClient.getGmailClient stubbed (the engine calls it through the module object). */
const withGmail = async (client, fn) => {
    const original = gmailClient.getGmailClient;
    gmailClient.getGmailClient = () => client;
    try {
        return await fn();
    } finally {
        gmailClient.getGmailClient = original;
    }
};

test("a new mail creates an Unassigned email ticket in the mailbox's team, with a new contact for the sender", async () => {
    const sentMs = BASE_MS;
    const normalized = mail({ from: { name: "Ravi Kumar", email: "ravi.kumar@newbank.test" }, subject: "ATM not dispensing", body: "ATM 12 is down", sentMs });
    const contactsBefore = countRows("HD_CONTACT_MASTER");

    const result = await ingest(normalized);

    assert.equal(result.status, "ingested");
    assert.equal(result.isNewTicket, true);
    const ticket = ticketRow(result.ticketId);
    const mailbox = getDB().prepare("SELECT * FROM HD_MAIL_REPLY_ADDRESS WHERE Email_Address = ?").get(MAILBOX);
    assert.equal(ticket.Department_Id, mailbox.Department_Id);
    assert.equal(ticket.Subject, "ATM not dispensing");
    assert.equal(ticket.Description, "ATM 12 is down");
    assert.equal(ticket.Channel, "Email");
    assert.equal(ticket.Status, "Unassigned");
    assert.equal(ticket.Created_Time, toIst(sentMs), "ticket is born at the mail's internal date");
    assert.match(ticket.Created_Time, /\+05:30$/);
    assert.equal(ticket.Sla_Start_Time, ticket.Created_Time);
    assert.equal(ticket.Thread_Count, 1);
    // Email tickets arrive without a priority, so there is no SLA due date yet.
    assert.equal(ticket.Priority, null);
    assert.equal(ticket.Response_Due_Date, null);

    assert.equal(countRows("HD_CONTACT_MASTER"), contactsBefore + 1);
    const contact = getDB().prepare("SELECT * FROM HD_CONTACT_MASTER WHERE Contact_Id = ?").get(ticket.Contact_Id);
    assert.equal(contact.Email, "ravi.kumar@newbank.test");
    assert.equal(contact.First_Name, "Ravi");
    assert.equal(contact.Last_Name, "Kumar");

    const [conversation] = conversationsOf(ticket.Ticket_Id);
    assert.equal(conversation.Direction, "in");
    assert.equal(conversation.Channel, "Email");
    assert.equal(conversation.Author_Contact_Id, contact.Contact_Id);
    assert.equal(conversation.Content, "ATM 12 is down");
    assert.equal(conversation.Sent_Time, toIst(sentMs));
    assert.equal(conversation.Post_Close_Decision, null);
    assert.equal(conversation.To_Address, MAILBOX);

    const thread = getDB().prepare("SELECT * FROM HD_TICKET_THREAD WHERE Thread_Id = ?").get(result.threadId);
    assert.equal(thread.Ticket_Id, ticket.Ticket_Id);
    assert.equal(thread.Conversation_Id, conversation.Conversation_Id);
    assert.equal(thread.Message_Id_Header, normalized.messageIdHeader);
    assert.equal(historyOf(ticket.Ticket_Id, "CREATED").length, 1);
});

test("a mail from a known customer is linked to the existing contact", async () => {
    const contact = createContact({ email: "known.customer@bank.test" });
    const contactsBefore = countRows("HD_CONTACT_MASTER");

    const result = await ingest(mail({ from: { name: "Someone Else", email: "known.customer@bank.test" } }));

    assert.equal(ticketRow(result.ticketId).Contact_Id, contact.Contact_Id);
    assert.equal(countRows("HD_CONTACT_MASTER"), contactsBefore);
});

test("a mail dated in the future is clamped to now", async () => {
    const before = Date.now();
    const result = await ingest(mail({ sentMs: Date.now() + 48 * HOUR }));
    const created = new Date(ticketRow(result.ticketId).Created_Time).getTime();
    assert.ok(created >= before - 1000 && created <= Date.now(), "Created_Time is not in the future");
});

test("the same message processed twice is a no-op", async () => {
    const normalized = mail();
    const first = await ingest(normalized);
    const tickets = countRows("HD_TICKET_MASTER");
    const conversations = countRows("HD_TICKET_CONVERSATION");

    const second = await ingest(normalized);

    assert.equal(second.status, "skipped");
    assert.equal(second.ticketId, first.ticketId);
    assert.equal(countRows("HD_TICKET_MASTER"), tickets);
    assert.equal(countRows("HD_TICKET_CONVERSATION"), conversations);
    assert.equal(ticketRow(first.ticketId).Thread_Count, 1);
});

test("a reply with In-Reply-To joins the existing ticket", async () => {
    const original = mail({ from: { name: "Asha", email: "asha@bank.test" } });
    const { ticketId } = await ingest(original);

    const reply = await ingest(mail({ from: { name: "Asha", email: "asha@bank.test" }, subject: "Re: Card switch down", inReplyTo: original.messageIdHeader }));

    assert.equal(reply.status, "ingested");
    assert.equal(reply.isNewTicket, false);
    assert.equal(reply.ticketId, ticketId);
    assert.equal(conversationsOf(ticketId).length, 2);
    assert.equal(ticketRow(ticketId).Thread_Count, 2);
    assert.equal(historyOf(ticketId, "CONVERSATION_ADDED").length, 1);
});

test("a reply matched only through its References chain joins the existing ticket", async () => {
    const original = mail();
    const { ticketId } = await ingest(original);

    const reply = await ingest(mail({
        subject: "Re: Card switch down",
        inReplyTo: "<not-on-the-desk@elsewhere.test>",
        references: `${original.messageIdHeader} <not-on-the-desk@elsewhere.test>`
    }));

    assert.equal(reply.ticketId, ticketId);
});

test("an agent's own reply sent from Gmail lands on the ticket as outbound", async () => {
    const customer = { name: "Out Bound", email: "outbound.customer@bank.test" };
    const original = mail({ from: customer });
    const { ticketId } = await ingest(original);

    const reply = await ingest(mail({ from: { name: "Support Desk", email: MAILBOX }, to: [customer], inReplyTo: original.messageIdHeader }));

    assert.equal(reply.ticketId, ticketId);
    const conversation = conversationsOf(ticketId).find((c) => c.Direction === "out");
    assert.ok(conversation, "outbound conversation stored");
    assert.equal(conversation.Author_Contact_Id, null);
    assert.ok(conversation.Author_Agent_Id);
});

test("a customer reply on a Closed ticket waits as PENDING and does not reopen it", async () => {
    const original = mail();
    const { ticketId } = await ingest(original);
    closeTicket(ticketId);
    const closed = ticketRow(ticketId);
    assert.equal(closed.Clock_State, "STOPPED");

    const reply = await ingest(mail({ from: original.from, subject: "Re: Card switch down", inReplyTo: original.messageIdHeader }));

    assert.equal(reply.ticketId, ticketId);
    const conversation = getDB().prepare("SELECT * FROM HD_TICKET_CONVERSATION WHERE Conversation_Id = (SELECT Conversation_Id FROM HD_TICKET_THREAD WHERE Thread_Id = ?)").get(reply.threadId);
    assert.equal(conversation.Post_Close_Decision, "PENDING");
    const after = ticketRow(ticketId);
    assert.equal(after.Status, "Closed");
    assert.equal(after.Clock_State, "STOPPED");
    assert.equal(after.Closed_Time, closed.Closed_Time);
    assert.equal(historyOf(ticketId, "REOPENED").length, 0);
});

test("an agent's outbound mail on a Closed ticket is not left waiting for a decision", async () => {
    const original = mail();
    const { ticketId } = await ingest(original);
    closeTicket(ticketId);

    const reply = await ingest(mail({ from: { name: "Support Desk", email: MAILBOX }, to: [original.from], inReplyTo: original.messageIdHeader }));

    assert.equal(reply.ticketId, ticketId);
    const outbound = conversationsOf(ticketId).find((c) => c.Direction === "out");
    assert.equal(outbound.Post_Close_Decision, null);
});

test("a reply quoting a split parent follows to the newest split child", async () => {
    const original = mail();
    const { ticketId: parentId } = await ingest(original);
    closeTicket(parentId);
    await ingest(mail({ from: original.from, subject: "Re: Card switch down", inReplyTo: original.messageIdHeader }));

    const split = await api.post(`/api/v1/tickets/${parentId}/split`, adminToken);
    assert.equal(split.status, 200);
    const childId = split.body.data.Ticket_Id;
    assert.notEqual(childId, parentId);

    // Answers the ORIGINAL message, which still lives on the parent.
    const later = await ingest(mail({ from: original.from, subject: "Re: Card switch down", inReplyTo: original.messageIdHeader, references: original.messageIdHeader }));

    assert.equal(later.ticketId, childId);
    assert.equal(ticketRow(parentId).Status, "Closed");
});

test("a reply to a ticket a person deleted opens a new ticket", async () => {
    const original = mail();
    const { ticketId } = await ingest(original);
    const res = await api.delete(`/api/v1/tickets/${ticketId}`, adminToken);
    assert.equal(res.status, 200);

    const reply = await ingest(mail({ from: original.from, subject: "Re: Card switch down", inReplyTo: original.messageIdHeader }));

    assert.equal(reply.status, "ingested");
    assert.equal(reply.isNewTicket, true);
    assert.notEqual(reply.ticketId, ticketId);
    assert.equal(ticketRow(ticketId).Is_Deleted, "Y", "the deleted ticket stays deleted");
});

test("after a person deletes and restores a ticket, a reply lands on it again", async () => {
    const original = mail();
    const { ticketId } = await ingest(original);
    assert.equal((await api.delete(`/api/v1/tickets/${ticketId}`, adminToken)).status, 200);
    const restored = await api.post(`/api/v1/tickets/${ticketId}/restore`, adminToken);
    assert.equal(restored.status, 200);

    const reply = await ingest(mail({ from: original.from, subject: "Re: Card switch down", inReplyTo: original.messageIdHeader }));

    assert.equal(reply.ticketId, ticketId);
    assert.equal(reply.isNewTicket, false);
    assert.equal(ticketRow(ticketId).Is_Deleted, "N");
});

test("runSync ingests listed messages once and records their Gmail ids", async () => {
    const messageId = `<sync-1.${process.pid}@bank.test>`;
    const raw = rawMessage({ id: "sync-gm-1", fromHeader: "Meena Iyer <meena@syncbank.test>", subject: "Sync check", messageId, internalDate: BASE_MS, body: "hello from sync" });
    const { client, calls } = fakeGmail(["sync-gm-1"], { "sync-gm-1": raw });

    const first = await withGmail(client, () => runSync({ mailbox: MAILBOX }));
    assert.equal(first.ingested, 1);
    assert.equal(first.ticketsCreated, 1);
    assert.deepEqual(first.errors, []);
    const row = gmailIngestedRepository.findByGmailMessageId("sync-gm-1");
    assert.ok(row && row.Ticket_Id);
    assert.equal(ticketRow(row.Ticket_Id).Created_Time, toIst(BASE_MS));

    const second = await withGmail(client, () => runSync({ mailbox: MAILBOX }));
    assert.equal(second.ingested, 0);
    assert.equal(second.skipped, 1);
    assert.equal(calls.get.length, 1, "an already-processed id is never fetched again");
});

test("a reply matching only a mail deleted in Gmail revives that mail's ticket", async () => {
    const messageId = `<gdel-1.${process.pid}@bank.test>`;
    const raw = rawMessage({ id: "gdel-gm-1", fromHeader: "Gopal <gopal@delbank.test>", subject: "Deleted in Gmail", messageId, internalDate: BASE_MS, body: "first" });
    await withGmail(fakeGmail(["gdel-gm-1"], { "gdel-gm-1": raw }).client, () => runSync({ mailbox: MAILBOX }));
    const ticketId = gmailIngestedRepository.findByGmailMessageId("gdel-gm-1").Ticket_Id;

    // Every other ingested mail is still live; only this one is gone from Gmail.
    const live = gmailIngestedRepository.findAll().map((r) => r.Gmail_Message_Id).filter((id) => id !== "gdel-gm-1");
    const deletion = await withGmail(fakeGmail(live).client, () => runDeletionSync({ mailbox: MAILBOX }));
    assert.equal(deletion.removed, 1);
    assert.equal(deletion.ticketsRemoved, 1);
    assert.equal(ticketRow(ticketId).Is_Deleted, "Y");
    assert.equal(historyOf(ticketId, "TICKET_DELETED").length, 0, "the Gmail sync is not a person's delete");

    const reply = await ingest(mail({ from: { name: "Gopal", email: "gopal@delbank.test" }, subject: "Re: Deleted in Gmail", inReplyTo: messageId }));

    assert.equal(reply.ticketId, ticketId);
    assert.equal(reply.isNewTicket, false);
    assert.equal(ticketRow(ticketId).Is_Deleted, "N");
});

test("a mail deleted in Gmail and moved back out of Trash is restored, not duplicated", async () => {
    const messageId = `<gdel-2.${process.pid}@bank.test>`;
    const raw = rawMessage({ id: "gdel-gm-2", fromHeader: "Lata <lata@delbank.test>", subject: "Trash round trip", messageId, internalDate: BASE_MS, body: "body" });
    await withGmail(fakeGmail(["gdel-gm-2"], { "gdel-gm-2": raw }).client, () => runSync({ mailbox: MAILBOX }));
    const ticketId = gmailIngestedRepository.findByGmailMessageId("gdel-gm-2").Ticket_Id;
    const live = gmailIngestedRepository.findAll().map((r) => r.Gmail_Message_Id).filter((id) => id !== "gdel-gm-2");
    await withGmail(fakeGmail(live).client, () => runDeletionSync({ mailbox: MAILBOX }));
    assert.equal(ticketRow(ticketId).Is_Deleted, "Y");

    const back = await withGmail(fakeGmail(["gdel-gm-2"], { "gdel-gm-2": raw }).client, () => runSync({ mailbox: MAILBOX }));

    assert.equal(back.ticketsCreated, 0);
    assert.equal(ticketRow(ticketId).Is_Deleted, "N");
    assert.equal(ticketRow(ticketId).Thread_Count, 1);
    assert.equal(conversationsOf(ticketId).length, 1);
});

test("a Gmail id of a purged ticket counts as processed and the sync skips it", async () => {
    const messageId = `<purge-1.${process.pid}@bank.test>`;
    const raw = rawMessage({ id: "purge-gm-1", fromHeader: "Purge Me <purge@bank.test>", subject: "To be purged", messageId, internalDate: BASE_MS, body: "x" });
    await withGmail(fakeGmail(["purge-gm-1"], { "purge-gm-1": raw }).client, () => runSync({ mailbox: MAILBOX }));
    const ticketId = gmailIngestedRepository.findByGmailMessageId("purge-gm-1").Ticket_Id;
    const ticket = ticketRow(ticketId);

    getDB().transaction(() => gmailIngestedRepository.markTicketPurged(ticketId, ticket.Ticket_Number))();

    assert.equal(gmailIngestedRepository.findByGmailMessageId("purge-gm-1"), undefined);
    const purged = getDB().prepare("SELECT * FROM _GMAIL_PURGED_MESSAGE WHERE Gmail_Message_Id = ?").get("purge-gm-1");
    assert.equal(purged.Ticket_Number, ticket.Ticket_Number);
    assert.equal(gmailIngestedRepository.isProcessed("purge-gm-1"), true);

    const { client, calls } = fakeGmail(["purge-gm-1"], { "purge-gm-1": raw });
    const result = await withGmail(client, () => runSync({ mailbox: MAILBOX }));
    assert.equal(result.skipped, 1);
    assert.equal(result.ingested, 0);
    assert.equal(calls.get.length, 0, "a purged mail is never fetched again");
});
