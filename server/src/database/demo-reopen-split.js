/**
 * Demo for "reply after close": takes two email tickets, moves them a week
 * back and plays each story through the real services on a simulated
 * clock, so history, tracking and SLA read like it really happened.
 *
 *   node src/database/demo-reopen-split.js <reopenTicketNo> <splitTicketNo>
 *
 *   Reopen example  assigned -> worked -> Closed; the customer mails in the
 *                   same thread "the error is back"; the lead reopens it
 *                   (Reopen #1) and assigns it again.
 *   New issue       assigned -> worked -> Closed; the customer mails a new
 *                   problem in the same thread; the lead creates it as a new
 *                   issue; a later reply to the OLD mail still lands on the
 *                   new ticket.
 *
 * Customer mails are written here and fed through the Gmail ingestion code
 * (no mail is sent). Test data only - never run against production.
 */
const RealDate = Date;
let fakeNow = RealDate.now();
class FakeDate extends RealDate {
    constructor(...args) {
        super(...(args.length ? args : [fakeNow]));
    }
    static now() {
        return fakeNow;
    }
}
global.Date = FakeDate;

const env = require("../config/env");
const { connectDB, closeDB } = require("../config/db");
const db = connectDB();
const DB_TABLES = require("../constants/db-tables");
const authService = require("../services/auth.service");
const ticketService = require("../services/ticket.service");
const assignmentService = require("../services/ticket-assignment.service");
const workService = require("../services/ticket-work.service");
const conversationService = require("../services/conversation.service");
const reopenService = require("../services/ticket-reopen.service");
const organizationService = require("../services/organization.service");
const { ingestMessage } = require("../integrations/gmail/ingestion.engine");
const logger = require("../utils/logger");

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const START = RealDate.now() - 7 * DAY; // one week ago
const at = (dayOffset, hhmm) => {
    // IST wall clock -> UTC instant, `dayOffset` days after START's date
    const d = new RealDate(START + dayOffset * DAY);
    const [h, m] = hhmm.split(":").map(Number);
    return RealDate.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) - 5.5 * HOUR;
};
const setClock = (ms) => { fakeNow = ms; };

const one = (sql, ...p) => db.prepare(sql).get(...p);
const ticketByNo = (no) => {
    const t = one(`SELECT * FROM ${DB_TABLES.TICKET} WHERE Ticket_Number = ?`, String(no).padStart(6, "0"));
    if (!t) throw new Error(`Ticket #${no} not found`);
    return t;
};
const agentByRole = (teamId, role, skip = []) => one(
    `SELECT a.Agent_Id FROM ${DB_TABLES.AGENT} a JOIN ${DB_TABLES.ROLE} r ON r.Role_Id = a.Role_Id
     WHERE r.Role_Key = ? AND a.Primary_Department_Id = ? AND a.Status = 'Active' AND a.Agent_Id NOT IN (${skip.map(() => "?").join(",") || "''"})
     ORDER BY a.Email LIMIT 1`, role, teamId, ...skip
);
const actorFor = (agentId) => {
    const p = authService.buildPrincipal(agentId);
    return { agentId, teamId: p.teamId, permissions: p.permissions };
};

/** Moves a ticket's existing mails, creation and SLA start so its first mail sits at `firstMs`. */
const shiftTicket = (ticket, firstMs) => {
    const first = one(`SELECT MIN(Sent_Time) AS t FROM ${DB_TABLES.TICKET_CONVERSATION} WHERE Ticket_Id = ?`, ticket.Ticket_Id).t;
    const offsetSec = Math.round((firstMs - new RealDate(first).getTime()) / 1000);
    const shift = (col) => `strftime('%Y-%m-%dT%H:%M:%fZ', ${col}, '${offsetSec >= 0 ? "+" : ""}${offsetSec} seconds')`;
    db.prepare(`UPDATE ${DB_TABLES.TICKET_CONVERSATION} SET Sent_Time = ${shift("Sent_Time")} WHERE Ticket_Id = ?`).run(ticket.Ticket_Id);
    db.prepare(`UPDATE ${DB_TABLES.TICKET_ATTACHMENT} SET Uploaded_Time = ${shift("Uploaded_Time")} WHERE Ticket_Id = ?`).run(ticket.Ticket_Id);
    db.prepare(`UPDATE ${DB_TABLES.TICKET_HISTORY} SET Event_Time = ${shift("Event_Time")} WHERE Ticket_Id = ?`).run(ticket.Ticket_Id);
    db.prepare(`UPDATE ${DB_TABLES.TICKET} SET Created_Time = ${shift("Created_Time")}, Sla_Start_Time = ${shift("Created_Time")} WHERE Ticket_Id = ?`).run(ticket.Ticket_Id);
};

const lastMessageId = (ticketId) => one(
    `SELECT th.Message_Id_Header AS id FROM ${DB_TABLES.TICKET_THREAD} th JOIN ${DB_TABLES.TICKET_CONVERSATION} c ON c.Conversation_Id = th.Conversation_Id
     WHERE th.Ticket_Id = ? ORDER BY c.Sent_Time DESC LIMIT 1`, ticketId
).id;
const firstMessageId = (ticketId) => one(
    `SELECT th.Message_Id_Header AS id FROM ${DB_TABLES.TICKET_THREAD} th JOIN ${DB_TABLES.TICKET_CONVERSATION} c ON c.Conversation_Id = th.Conversation_Id
     WHERE th.Ticket_Id = ? ORDER BY c.Sent_Time ASC LIMIT 1`, ticketId
).id;

/** A customer mail in the ticket's thread, answering `inReplyTo`. */
const customerMail = async ({ ticket, sentMs, inReplyTo, references, text, key }) => {
    const contact = one(`SELECT * FROM ${DB_TABLES.CONTACT} WHERE Contact_Id = ?`, ticket.Contact_Id);
    const system = organizationService.getSystemAgent();
    return ingestMessage({
        gmailMessageId: `demo-${key}`,
        gmailThreadId: `demo-thread-${ticket.Ticket_Id}`,
        messageIdHeader: `<demo-${key}-${ticket.Ticket_Id}@demo.sunoida.local>`,
        inReplyToHeader: inReplyTo,
        referencesHeader: references,
        subject: `Re: ${ticket.Subject}`,
        from: { email: contact.Email, name: [contact.First_Name, contact.Last_Name].filter(Boolean).join(" ") },
        replyTo: [],
        to: [{ email: env.google.mailbox, name: "Support" }],
        cc: [],
        sentTime: new RealDate(sentMs).toISOString(),
        bodyText: text,
        bodyHtml: null,
        attachments: []
    }, system.Agent_Id, env.google.mailbox, []);
};

const workAndClose = ({ ticket, lead, member, bankId, day0, closeDay }) => {
    setClock(at(day0, "10:05"));
    ticketService.updateTicket(ticket.Ticket_Id, { bankId, priority: "P2", classification: "Complaint", category: "Application" }, lead.agentId);
    setClock(at(day0, "10:20"));
    assignmentService.addAssignees(ticket.Ticket_Id, [member.agentId], lead, { note: "Please check the logs for this bank" });
    setClock(at(day0, "11:00"));
    workService.changeState(ticket.Ticket_Id, member.agentId, { state: "IN_PROGRESS" }, member);
    setClock(at(day0, "16:40"));
    conversationService.addComment(ticket.Ticket_Id, { content: "Found the cause - a config value was missing on the bank's side. Fix applied." }, member.agentId);
    setClock(at(day0 + 1, "12:30"));
    workService.addWorklog(ticket.Ticket_Id, member.agentId, { minutes: 150, note: "Investigation and fix" }, member);
    workService.changeState(ticket.Ticket_Id, member.agentId, { state: "DONE", note: "Fixed and verified" }, member);
    setClock(at(day0 + 1, "12:45"));
    ticketService.updateTicket(ticket.Ticket_Id, { status: "In Progress" }, lead.agentId);
    setClock(at(closeDay, "15:10"));
    ticketService.updateTicket(ticket.Ticket_Id, { status: "Closed" }, lead.agentId);
};

const run = async () => {
    const [reopenNo, splitNo] = process.argv.slice(2);
    if (!reopenNo || !splitNo) throw new Error("usage: node src/database/demo-reopen-split.js <reopenTicketNo> <splitTicketNo>");

    // --- Reopen example: I&M Kenya, Support Team A --------------------------
    const bankA = one(`SELECT Bank_Id, Department_Id FROM ${DB_TABLES.BANK} WHERE Bank_Name = 'I&M Kenya'`);
    const leadA = actorFor(agentByRole(bankA.Department_Id, "TEAM_LEAD").Agent_Id);
    const memberA = actorFor(agentByRole(bankA.Department_Id, "TEAM_MEMBER").Agent_Id);
    let a = ticketByNo(reopenNo);
    shiftTicket(a, at(0, "09:15"));
    workAndClose({ ticket: a, lead: leadA, member: memberA, bankId: bankA.Bank_Id, day0: 0, closeDay: 2 });
    a = ticketByNo(reopenNo);
    const aLast = lastMessageId(a.Ticket_Id);
    setClock(at(5, "11:05"));
    await customerMail({
        ticket: a, key: "reopen", sentMs: at(5, "11:05"), inReplyTo: aLast, references: aLast,
        text: "Hi team,\n\nThe same error has come back since this morning - the report fails with the identical message as before.\n\nRegards"
    });
    setClock(at(5, "11:40"));
    reopenService.reopenTicket(a.Ticket_Id, { reason: "Same error came back after the fix - customer confirmed on the thread" }, leadA);
    setClock(at(5, "11:50"));
    assignmentService.addAssignees(a.Ticket_Id, [memberA.agentId], leadA, { note: "Reopened - same issue, please re-check the fix" });
    setClock(at(5, "12:30"));
    workService.changeState(a.Ticket_Id, memberA.agentId, { state: "IN_PROGRESS" }, memberA);

    // --- New issue example: UBA, Support Team C -----------------------------
    const bankC = one(`SELECT Bank_Id, Department_Id FROM ${DB_TABLES.BANK} WHERE Bank_Name = 'UBA'`);
    const leadC = actorFor(agentByRole(bankC.Department_Id, "TEAM_LEAD").Agent_Id);
    const memberC = actorFor(agentByRole(bankC.Department_Id, "TEAM_MEMBER").Agent_Id);
    let b = ticketByNo(splitNo);
    shiftTicket(b, at(0, "10:40"));
    workAndClose({ ticket: b, lead: leadC, member: memberC, bankId: bankC.Bank_Id, day0: 0, closeDay: 3 });
    b = ticketByNo(splitNo);
    const bFirst = firstMessageId(b.Ticket_Id);
    const bLast = lastMessageId(b.Ticket_Id);
    setClock(at(6, "10:15"));
    await customerMail({
        ticket: b, key: "newissue", sentMs: at(6, "10:15"), inReplyTo: bLast, references: `${bFirst} ${bLast}`,
        text: "Hi team,\n\nThanks, the earlier lineage issue is fine now. Separately, the monthly export to Excel is failing for the branch-wise report - can you check?\n\nRegards"
    });
    setClock(at(6, "10:45"));
    const created = reopenService.splitTicket(b.Ticket_Id, leadC);
    setClock(at(6, "11:00"));
    assignmentService.addAssignees(created.Ticket_Id, [memberC.agentId], leadC, { note: "New issue from the customer's reply on #" + b.Ticket_Number });
    // The customer answers the OLD first mail again - it must still land on the new ticket.
    setClock(at(6, "15:20"));
    const late = await customerMail({
        ticket: b, key: "newissue-followup", sentMs: at(6, "15:20"), inReplyTo: bFirst, references: bFirst,
        text: "Adding the screenshot details for the export problem: it stops at 80% and shows 'timeout'."
    });

    logger.info(`Reopen example: #${a.Ticket_Number} (Reopen #1, reassigned).`);
    logger.info(`New issue example: #${b.Ticket_Number} -> new ticket #${created.Ticket_Number}; later reply routed to ticket ${late.ticketId === created.Ticket_Id ? "#" + created.Ticket_Number + " (correct)" : late.ticketId + " (WRONG)"}.`);
};

run()
    .catch((error) => {
        logger.error("Demo failed:", error);
        process.exitCode = 1;
    })
    .finally(() => {
        global.Date = RealDate;
        closeDB();
    });
