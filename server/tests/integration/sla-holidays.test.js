require("../helpers/env");
const { test, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const { setupDatabase, getDB } = require("../helpers/db");
const { startApi } = require("../helpers/api");
const { agentWithRole, signIn, supportTeam, createTicket, systemAgentId } = require("../helpers/fixtures");
const bankService = require("../../src/services/bank.service");
const ticketService = require("../../src/services/ticket.service");
const holidayWorkService = require("../../src/services/holiday-work.service");
const { computeSlaDueDate } = require("../../src/services/sla/sla.service");
const { ALL_PERMISSION_KEYS, DEFAULT_ROLES } = require("../../src/constants/permissions");

// All dates are fixed in 2026 (IST). Seeded holidays used: 2026-01-26, 2026-05-01 (Fri).
// March and April 2026 have no seeded holidays.
const ist = (local) => `${local}:00.000+05:30`; // "2026-03-06T18:00" -> stored IST ISO

let api;
let teamId;
let monFriBank;
let allDayBank;
let bankCounter = 0;

const makeBank = (overrides = {}) => {
    bankCounter += 1;
    return bankService.createBank({
        bankName: `SLA Test Bank ${bankCounter}`,
        departmentId: teamId,
        workingDays: ["MON", "TUE", "WED", "THU", "FRI"],
        timeZone: "Asia/Kolkata",
        supportStartIst: "10:30",
        supportEndIst: "19:30",
        ...overrides
    }, systemAgentId());
};

const ticketRow = (ticketId) => getDB().prepare("SELECT * FROM HD_TICKET_MASTER WHERE Ticket_Id = ?").get(ticketId);
const triggers = (ticketId) => getDB().prepare(
    "SELECT Level_No, Trigger_Time FROM HD_TICKET_ESCALATION WHERE Ticket_Id = ? ORDER BY Level_No"
).all(ticketId).map((r) => [r.Level_No, r.Trigger_Time]);
const segments = (ticketId) => getDB().prepare(
    "SELECT * FROM HD_TICKET_CLOCK_SEGMENT WHERE Ticket_Id = ? ORDER BY Started_Time"
).all(ticketId);
const resolutionMins = (ticketId) => getDB().prepare(
    "SELECT Resolution_Time_Mins FROM HD_TICKET_METRICS WHERE Ticket_Id = ?"
).get(ticketId).Resolution_Time_Mins;

/** Runs `fn` with Date frozen at the given IST local time (the services read "now" from Date). */
const at = (local, fn) => {
    mock.timers.setTime(new Date(ist(local)).getTime());
    return fn();
};

/** No Assistant TL is seeded: promote a seeded member (in this test DB only). */
const assistantTeamLead = () => {
    const db = getDB();
    const existing = db.prepare(
        `SELECT a.Agent_Id FROM HD_AGENT_MASTER a JOIN HD_ROLE_MASTER r ON r.Role_Id = a.Role_Id
         WHERE r.Role_Key = 'ASSISTANT_TEAM_LEAD' AND a.Is_Deleted = 'N' AND a.Status = 'Active'`
    ).get();
    if (existing) return agentWithRole("ASSISTANT_TEAM_LEAD");
    const roleId = db.prepare("SELECT Role_Id FROM HD_ROLE_MASTER WHERE Role_Key = 'ASSISTANT_TEAM_LEAD'").get().Role_Id;
    const member = db.prepare(
        `SELECT a.Agent_Id FROM HD_AGENT_MASTER a JOIN HD_ROLE_MASTER r ON r.Role_Id = a.Role_Id
         WHERE r.Role_Key = 'TEAM_MEMBER' AND a.Is_Deleted = 'N' AND a.Status = 'Active' ORDER BY a.Agent_Id DESC LIMIT 1`
    ).get();
    db.prepare("UPDATE HD_AGENT_MASTER SET Role_Id = ? WHERE Agent_Id = ?").run(roleId, member.Agent_Id);
    return agentWithRole("ASSISTANT_TEAM_LEAD");
};

const statusOf = (fn) => {
    try {
        fn();
    } catch (error) {
        return error.status;
    }
    return "no error";
};

before(async () => {
    setupDatabase();
    teamId = supportTeam().Department_Id;
    monFriBank = makeBank();
    allDayBank = makeBank({ is24x7: true });
    api = await startApi();
});
after(() => api.close());

// ---------------------------------------------------------------- SLA due date

test("a new ticket is due Sla_Start_Time + priority hours, skipping the weekend on a Mon-Fri bank", () => {
    // 2026-03-06 is a Friday; P1 = 24h.
    const ticket = createTicket({ bankId: monFriBank.Bank_Id, priority: "P1", createdTime: ist("2026-03-06T18:00") });
    const row = ticketRow(ticket.Ticket_Id);
    assert.equal(row.Sla_Start_Time, ist("2026-03-06T18:00"));
    assert.equal(row.Created_Time, ist("2026-03-06T18:00"));
    assert.equal(row.Response_Due_Date, ist("2026-03-09T18:00"), "Friday 18:00 + 24h skips Sat/Sun");
});

test("a 24x7 bank counts every hour, weekend included", () => {
    const ticket = createTicket({ bankId: allDayBank.Bank_Id, priority: "P1", createdTime: ist("2026-03-06T18:00") });
    assert.equal(ticketRow(ticket.Ticket_Id).Response_Due_Date, ist("2026-03-07T18:00"));
});

test("P2 (72h) from Friday evening lands on Wednesday on a Mon-Fri bank", () => {
    const ticket = createTicket({ bankId: monFriBank.Bank_Id, priority: "P2", createdTime: ist("2026-03-06T18:00") });
    assert.equal(ticketRow(ticket.Ticket_Id).Response_Due_Date, ist("2026-03-11T18:00"));
});

test("computeSlaDueDate gives null without a priority or for an unknown priority", () => {
    const orgId = ticketRow(createTicket({ bankId: monFriBank.Bank_Id, priority: "P1" }).Ticket_Id).Org_Id;
    assert.equal(computeSlaDueDate({ createdTime: ist("2026-03-06T18:00"), priority: null, bankId: monFriBank.Bank_Id, orgId }), null);
    assert.equal(computeSlaDueDate({ createdTime: ist("2026-03-06T18:00"), priority: "P9", bankId: monFriBank.Bank_Id, orgId }), null);
});

test("escalation triggers are the due date plus each level's offset on the bank calendar", () => {
    // Seeded P1 levels: L1 -4h, L2 0h, L3 +8h.
    const ticket = createTicket({ bankId: monFriBank.Bank_Id, priority: "P1", createdTime: ist("2026-03-06T18:00") });
    assert.deepEqual(triggers(ticket.Ticket_Id), [
        [1, ist("2026-03-09T14:00")],
        [2, ist("2026-03-09T18:00")],
        [3, ist("2026-03-10T02:00")]
    ]);
});

test("an escalation level before the due date walks back over the weekend", () => {
    // Friday 02:00 + 24h -> Monday 02:00; L1 = -4h: 2h of Monday, skip Sat/Sun, 2h of Friday -> Friday 22:00.
    const ticket = createTicket({ bankId: monFriBank.Bank_Id, priority: "P1", createdTime: ist("2026-03-06T02:00") });
    assert.equal(ticketRow(ticket.Ticket_Id).Response_Due_Date, ist("2026-03-09T02:00"));
    assert.deepEqual(triggers(ticket.Ticket_Id), [
        [1, ist("2026-03-06T22:00")],
        [2, ist("2026-03-09T02:00")],
        [3, ist("2026-03-09T10:00")]
    ]);
});

test("changing a ticket's priority re-dates it from Sla_Start_Time and rebuilds triggers", () => {
    const ticket = createTicket({ bankId: monFriBank.Bank_Id, priority: "P1", createdTime: ist("2026-03-06T06:00") });
    ticketService.updateTicket(ticket.Ticket_Id, { priority: "P2" }, systemAgentId());
    const row = ticketRow(ticket.Ticket_Id);
    assert.equal(row.Response_Due_Date, ist("2026-03-11T06:00"), "priority change re-dates from Sla_Start_Time");
    assert.deepEqual(triggers(ticket.Ticket_Id), [
        [1, ist("2026-03-10T18:00")],
        [2, ist("2026-03-11T06:00")],
        [3, ist("2026-03-12T06:00")]
    ]);
});

test("clearing the priority clears the SLA and its escalation triggers", () => {
    const ticket = createTicket({ bankId: monFriBank.Bank_Id, priority: "P1", createdTime: ist("2026-03-06T18:00") });
    ticketService.updateTicket(ticket.Ticket_Id, { priority: null }, systemAgentId());
    assert.equal(ticketRow(ticket.Ticket_Id).Response_Due_Date, null);
    assert.deepEqual(triggers(ticket.Ticket_Id), []);
});

// ---------------------------------------------------------------- re-dating on config change

test("changing a bank's working days re-dates its open tickets from Sla_Start_Time and rebuilds triggers", async () => {
    const admin = agentWithRole("ADMIN");
    const token = signIn(admin);
    const bank = makeBank();
    const open = createTicket({ bankId: bank.Bank_Id, priority: "P1", createdTime: ist("2026-03-06T18:00") });
    // Simulate a reopen: the SLA restarted on Tuesday 09:00, later than Created_Time.
    getDB().prepare("UPDATE HD_TICKET_MASTER SET Sla_Start_Time = ? WHERE Ticket_Id = ?").run(ist("2026-03-10T09:00"), open.Ticket_Id);
    const closed = createTicket({ bankId: bank.Bank_Id, priority: "P1", createdTime: ist("2026-03-06T18:00") });
    ticketService.updateTicket(closed.Ticket_Id, { status: "Closed" }, systemAgentId());
    const closedDue = ticketRow(closed.Ticket_Id).Response_Due_Date;

    const res = await api.patch(`/api/v1/banks/${bank.Bank_Id}`, token, {
        workingDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
    });
    assert.equal(res.status, 200);

    assert.equal(ticketRow(open.Ticket_Id).Response_Due_Date, ist("2026-03-11T09:00"), "from Sla_Start_Time, not Created_Time");
    assert.deepEqual(triggers(open.Ticket_Id).map(([, t]) => t), [ist("2026-03-11T05:00"), ist("2026-03-11T09:00"), ist("2026-03-11T17:00")]);
    assert.equal(ticketRow(closed.Ticket_Id).Response_Due_Date, closedDue, "a closed ticket keeps its SLA");
});

test("switching a bank to 24x7 moves a weekend-spanning due date earlier", async () => {
    const token = signIn(agentWithRole("ADMIN"));
    const bank = makeBank();
    const ticket = createTicket({ bankId: bank.Bank_Id, priority: "P1", createdTime: ist("2026-03-06T18:00") });
    assert.equal(ticketRow(ticket.Ticket_Id).Response_Due_Date, ist("2026-03-09T18:00"));
    const res = await api.patch(`/api/v1/banks/${bank.Bank_Id}`, token, { is24x7: true });
    assert.equal(res.status, 200);
    assert.equal(ticketRow(ticket.Ticket_Id).Response_Due_Date, ist("2026-03-07T18:00"));
    assert.equal(triggers(ticket.Ticket_Id)[1][1], ist("2026-03-07T18:00"));
});

test(
    "changing a priority's SLA hours re-dates open tickets on that priority and rebuilds triggers",
    { todo: "BUG: priority-sla.service upsertConfig only updates Sla_Hours - open tickets keep the old due date" },
    async () => {
        const token = signIn(agentWithRole("ADMIN"));
        // 2026-03-02 is a Monday; P2 72h -> Thursday 10:00.
        const ticket = createTicket({ bankId: monFriBank.Bank_Id, priority: "P2", createdTime: ist("2026-03-02T10:00") });
        assert.equal(ticketRow(ticket.Ticket_Id).Response_Due_Date, ist("2026-03-05T10:00"));
        try {
            const res = await api.put("/api/v1/priority-sla/P2", token, { slaHours: 48 });
            assert.equal(res.status, 200);
            assert.equal(ticketRow(ticket.Ticket_Id).Response_Due_Date, ist("2026-03-04T10:00"));
            assert.equal(triggers(ticket.Ticket_Id)[1][1], ist("2026-03-04T10:00"));
        } finally {
            await api.put("/api/v1/priority-sla/P2", token, { slaHours: 72 });
        }
    }
);

// ---------------------------------------------------------------- resolution clock

test("resolution clock: RUNNING opens a segment, PAUSED closes it, STOPPED stores support-window minutes", () => {
    mock.timers.enable({ apis: ["Date"], now: new Date(ist("2026-03-16T09:00")) });
    try {
        const actor = systemAgentId();
        // 2026-03-16 is a Monday; bank support window 10:30-19:30 IST.
        const ticket = at("2026-03-16T09:00", () => createTicket({ bankId: monFriBank.Bank_Id, priority: "P2", status: "Unassigned" }));
        const id = ticket.Ticket_Id;
        const due = ticketRow(id).Response_Due_Date;
        assert.equal(ticketRow(id).Clock_State, "NOT_STARTED");
        assert.equal(segments(id).length, 0);

        at("2026-03-16T10:00", () => ticketService.updateTicket(id, { status: "In Progress" }, actor));
        assert.equal(ticketRow(id).Clock_State, "RUNNING");
        assert.equal(ticketRow(id).Resolution_Started_Time, ist("2026-03-16T10:00"));
        assert.equal(segments(id).length, 1);
        assert.equal(segments(id)[0].Ended_Time, null);

        at("2026-03-16T12:00", () => ticketService.updateTicket(id, { status: "On Hold - Client" }, actor));
        assert.equal(ticketRow(id).Clock_State, "PAUSED");
        assert.equal(segments(id)[0].Ended_Time, ist("2026-03-16T12:00"));
        assert.equal(resolutionMins(id), 90, "only 10:30-12:00 is inside the support window");
        assert.equal(ticketRow(id).Response_Due_Date, due, "the SLA never pauses");

        at("2026-03-16T15:00", () => ticketService.updateTicket(id, { status: "In Progress" }, actor));
        assert.equal(segments(id).length, 2);

        at("2026-03-17T11:00", () => ticketService.updateTicket(id, { status: "Closed" }, actor));
        const row = ticketRow(id);
        assert.equal(row.Clock_State, "STOPPED");
        assert.equal(row.Closed_Time, ist("2026-03-17T11:00"));
        assert.ok(segments(id).every((s) => s.Ended_Time));
        // Mon 10:30-12:00 (90) + Mon 15:00-19:30 (270) + Tue 10:30-11:00 (30).
        assert.equal(resolutionMins(id), 390);
        assert.equal(row.Response_Due_Date, due);
    } finally {
        mock.timers.reset();
    }
});

test("resolution clock on a 24x7 bank counts every minute", () => {
    mock.timers.enable({ apis: ["Date"], now: new Date(ist("2026-03-16T09:00")) });
    try {
        const actor = systemAgentId();
        const ticket = at("2026-03-16T09:00", () => createTicket({ bankId: allDayBank.Bank_Id, priority: "P2", status: "Unassigned" }));
        const id = ticket.Ticket_Id;
        at("2026-03-16T10:00", () => ticketService.updateTicket(id, { status: "In Progress" }, actor));
        at("2026-03-16T12:00", () => ticketService.updateTicket(id, { status: "On Hold - Client" }, actor));
        at("2026-03-16T15:00", () => ticketService.updateTicket(id, { status: "In Progress" }, actor));
        at("2026-03-17T11:00", () => ticketService.updateTicket(id, { status: "Closed" }, actor));
        // 2h + 20h.
        assert.equal(resolutionMins(id), 120 + 1200);
    } finally {
        mock.timers.reset();
    }
});

test("a Closed ticket cannot be moved back through the status list", () => {
    const ticket = createTicket({ bankId: monFriBank.Bank_Id, priority: "P2" });
    ticketService.updateTicket(ticket.Ticket_Id, { status: "Closed" }, systemAgentId());
    assert.equal(statusOf(() => ticketService.updateTicket(ticket.Ticket_Id, { status: "In Progress" }, systemAgentId())), 400);
});

// ---------------------------------------------------------------- holidays: permissions

test("holiday calendar needs holidays.manage: Admin, Manager, Team Lead allowed; Assistant TL and Member refused", async () => {
    for (const role of ["ADMIN", "MANAGER", "TEAM_LEAD"]) {
        const res = await api.get("/api/v1/holidays?year=2026", signIn(agentWithRole(role)));
        assert.equal(res.status, 200, role);
        assert.equal(res.body.data.holidays.length, 9, "the nine seeded 2026 holidays");
        assert.equal(res.body.data.settings.applyTo24x7, false);
    }
    for (const role of ["ASSISTANT_TEAM_LEAD", "TEAM_MEMBER"]) {
        const token = signIn(role === "ASSISTANT_TEAM_LEAD" ? assistantTeamLead() : agentWithRole(role));
        assert.equal((await api.get("/api/v1/holidays", token)).status, 403, role);
        assert.equal((await api.post("/api/v1/holidays", token, { holidayDate: "2026-04-14", holidayName: "Nope" })).status, 403, role);
        assert.equal((await api.put("/api/v1/holidays/settings", token, { applyTo24x7: true })).status, 403, role);
    }
});

test("a duplicate or malformed holiday date is refused", async () => {
    const token = signIn(agentWithRole("TEAM_LEAD"));
    assert.equal((await api.post("/api/v1/holidays", token, { holidayDate: "2026-01-26", holidayName: "Again" })).status, 400);
    assert.equal((await api.post("/api/v1/holidays", token, { holidayDate: "26-01-2026", holidayName: "Bad" })).status, 400);
    assert.equal((await api.post("/api/v1/holidays", token, { holidayDate: "2026-02-30", holidayName: "Bad" })).status, 400);
});

// ---------------------------------------------------------------- holidays: SLA impact

test("a holiday inside an open ticket's SLA window pushes its due date a day; 24x7 banks ignore it unless the setting is on", async () => {
    const token = signIn(agentWithRole("TEAM_LEAD"));
    // 2026-04-06 is a Monday; P2 72h -> Thursday 10:00 on both banks.
    const weekday = createTicket({ bankId: monFriBank.Bank_Id, priority: "P2", createdTime: ist("2026-04-06T10:00") });
    const allDay = createTicket({ bankId: allDayBank.Bank_Id, priority: "P2", createdTime: ist("2026-04-06T10:00") });
    assert.equal(ticketRow(weekday.Ticket_Id).Response_Due_Date, ist("2026-04-09T10:00"));
    assert.equal(ticketRow(allDay.Ticket_Id).Response_Due_Date, ist("2026-04-09T10:00"));

    // Preview is read-only and names the ticket that would move.
    const preview = await api.get("/api/v1/holidays/impact?date=2026-04-07", token);
    assert.equal(preview.status, 200);
    const hit = preview.body.data.affected.find((a) => a.ticketId === weekday.Ticket_Id);
    assert.deepEqual({ from: hit.from, to: hit.to }, { from: ist("2026-04-09T10:00"), to: ist("2026-04-10T10:00") });
    assert.ok(!preview.body.data.affected.some((a) => a.ticketId === allDay.Ticket_Id), "24x7 bank is not affected");
    assert.equal(ticketRow(weekday.Ticket_Id).Response_Due_Date, ist("2026-04-09T10:00"), "preview changes nothing");

    const created = await api.post("/api/v1/holidays", token, { holidayDate: "2026-04-07", holidayName: "Test Holiday" });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.holiday.Weekday, "Tuesday");
    assert.ok(created.body.data.ticketsMoved >= 1);
    const holidayId = created.body.data.holiday.Holiday_Id;

    assert.equal(ticketRow(weekday.Ticket_Id).Response_Due_Date, ist("2026-04-10T10:00"));
    assert.equal(triggers(weekday.Ticket_Id)[1][1], ist("2026-04-10T10:00"), "escalation triggers rebuilt");
    assert.equal(ticketRow(allDay.Ticket_Id).Response_Due_Date, ist("2026-04-09T10:00"));

    const metrics = await api.get(`/api/v1/tickets/${weekday.Ticket_Id}/metrics`, token);
    assert.equal(metrics.status, 200);
    assert.deepEqual(metrics.body.data.holidaysInSla, [{ date: "2026-04-07", name: "Test Holiday" }]);

    // Holidays now apply to 24x7 banks too.
    const on = await api.put("/api/v1/holidays/settings", token, { applyTo24x7: true });
    assert.equal(on.status, 200);
    assert.equal(on.body.data.settings.applyTo24x7, true);
    assert.equal(ticketRow(allDay.Ticket_Id).Response_Due_Date, ist("2026-04-10T10:00"));
    const off = await api.put("/api/v1/holidays/settings", token, { applyTo24x7: false });
    assert.equal(off.status, 200);
    assert.equal(ticketRow(allDay.Ticket_Id).Response_Due_Date, ist("2026-04-09T10:00"));

    // Rename: no re-dating.
    const renamed = await api.patch(`/api/v1/holidays/${holidayId}`, token, { holidayName: "Renamed Holiday" });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.data.holiday.Holiday_Name, "Renamed Holiday");
    assert.equal(renamed.body.data.ticketsMoved, 0);

    // Move it to another day still inside the window: one day is still skipped.
    const moved = await api.patch(`/api/v1/holidays/${holidayId}`, token, { holidayDate: "2026-04-08" });
    assert.equal(moved.status, 200);
    assert.equal(ticketRow(weekday.Ticket_Id).Response_Due_Date, ist("2026-04-10T10:00"));
    assert.equal((await api.patch(`/api/v1/holidays/${holidayId}`, token, { holidayDate: "2026-01-26" })).status, 400, "moving onto an existing holiday");

    const removePreview = await api.get("/api/v1/holidays/impact?date=2026-04-08&remove=true", token);
    assert.equal(removePreview.body.data.affected.find((a) => a.ticketId === weekday.Ticket_Id).to, ist("2026-04-09T10:00"));

    const removed = await api.delete(`/api/v1/holidays/${holidayId}`, token);
    assert.equal(removed.status, 200);
    assert.equal(ticketRow(weekday.Ticket_Id).Response_Due_Date, ist("2026-04-09T10:00"));
    const row = getDB().prepare("SELECT Is_Deleted FROM HD_HOLIDAY WHERE Holiday_Id = ?").get(holidayId);
    assert.equal(row.Is_Deleted, "Y", "soft delete");
    const list = await api.get("/api/v1/holidays?year=2026", token);
    assert.ok(!list.body.data.holidays.some((h) => h.Holiday_Id === holidayId));
});

test("a closed ticket's SLA is not re-dated when a holiday is added", async () => {
    const token = signIn(agentWithRole("ADMIN"));
    const ticket = createTicket({ bankId: monFriBank.Bank_Id, priority: "P2", createdTime: ist("2026-04-13T10:00") });
    ticketService.updateTicket(ticket.Ticket_Id, { status: "Closed" }, systemAgentId());
    const due = ticketRow(ticket.Ticket_Id).Response_Due_Date;
    const created = await api.post("/api/v1/holidays", token, { holidayDate: "2026-04-14", holidayName: "Closed Check" });
    assert.equal(created.status, 201);
    try {
        assert.equal(ticketRow(ticket.Ticket_Id).Response_Due_Date, due);
    } finally {
        await api.delete(`/api/v1/holidays/${created.body.data.holiday.Holiday_Id}`, token);
    }
});

// ---------------------------------------------------------------- holiday timer

test("holiday timer: work on a holiday adds to resolution time only, never the SLA", () => {
    const admin = agentWithRole("ADMIN");
    const actor = { agentId: admin.Agent_Id, permissions: ALL_PERMISSION_KEYS };
    mock.timers.enable({ apis: ["Date"], now: new Date(ist("2026-04-30T18:00")) });
    try {
        // Thursday 18:00 -> 2026-05-01 (Friday) is the seeded May Day holiday.
        const ticket = at("2026-04-30T18:00", () => createTicket({ bankId: monFriBank.Bank_Id, priority: "P1", status: "In Progress" }));
        const id = ticket.Ticket_Id;
        const due = ticketRow(id).Response_Due_Date;
        // Thu 18:00 + 6h, Fri holiday, Sat/Sun weekend, Mon +18h.
        assert.equal(due, ist("2026-05-04T18:00"));

        assert.equal(statusOf(() => at("2026-04-30T19:00", () => holidayWorkService.startTimer(id, actor))), 400, "not a holiday");

        const started = at("2026-05-01T11:00", () => holidayWorkService.startTimer(id, actor));
        assert.equal(started.Holiday_Date, "2026-05-01");
        assert.equal(started.Started_Time, ist("2026-05-01T11:00"));
        assert.equal(statusOf(() => at("2026-05-01T11:05", () => holidayWorkService.startTimer(id, actor))), 400, "already running");
        const status = at("2026-05-01T12:00", () => holidayWorkService.timerStatus(ticketRow(id), admin.Agent_Id));
        assert.equal(status.holidayToday.name, "May Day");
        assert.ok(status.running);

        const stopped = at("2026-05-01T13:30", () => holidayWorkService.stopTimer(id, actor));
        assert.equal(stopped.Minutes, 150);
        assert.equal(statusOf(() => at("2026-05-01T13:31", () => holidayWorkService.stopTimer(id, actor))), 400, "nothing to stop");

        const metrics = at("2026-05-01T14:00", () => ticketService.getTicketMetrics(id));
        // Thu 18:00-19:30 inside the support window (90) + 150 holiday-timer minutes.
        assert.equal(metrics.resolutionMinutes, 90 + 150);
        assert.equal(ticketRow(id).Response_Due_Date, due, "SLA untouched");
    } finally {
        mock.timers.reset();
    }
});

test("holiday timer refuses a paused ticket, a 24x7 bank (setting off) and someone not assigned", () => {
    const admin = agentWithRole("ADMIN");
    const actor = { agentId: admin.Agent_Id, permissions: ALL_PERMISSION_KEYS };
    const member = agentWithRole("TEAM_MEMBER");
    const memberPerms = DEFAULT_ROLES.find((r) => r.key === "TEAM_MEMBER").permissions;
    mock.timers.enable({ apis: ["Date"], now: new Date(ist("2026-04-30T18:00")) });
    try {
        const paused = at("2026-04-30T18:00", () => createTicket({ bankId: monFriBank.Bank_Id, priority: "P1", status: "On Hold - Client" }));
        const allDay = at("2026-04-30T18:00", () => createTicket({ bankId: allDayBank.Bank_Id, priority: "P1", status: "In Progress" }));
        const running = at("2026-04-30T18:00", () => createTicket({ bankId: monFriBank.Bank_Id, priority: "P1", status: "In Progress" }));
        at("2026-05-01T11:00", () => {
            assert.equal(statusOf(() => holidayWorkService.startTimer(paused.Ticket_Id, actor)), 400);
            assert.equal(statusOf(() => holidayWorkService.startTimer(allDay.Ticket_Id, actor)), 400);
            assert.equal(statusOf(() => holidayWorkService.startTimer(running.Ticket_Id, { agentId: member.Agent_Id, permissions: memberPerms })), 403);
        });
    } finally {
        mock.timers.reset();
    }
});

test("a holiday timer left running is closed at the holiday's midnight", () => {
    const admin = agentWithRole("ADMIN");
    const actor = { agentId: admin.Agent_Id, permissions: ALL_PERMISSION_KEYS };
    mock.timers.enable({ apis: ["Date"], now: new Date(ist("2026-04-30T18:00")) });
    try {
        const ticket = at("2026-04-30T18:00", () => createTicket({ bankId: monFriBank.Bank_Id, priority: "P1", status: "In Progress" }));
        const started = at("2026-05-01T22:00", () => holidayWorkService.startTimer(ticket.Ticket_Id, actor));

        // Same day: nothing to close yet.
        at("2026-05-01T23:00", () => holidayWorkService.closeOverdueTimers());
        const still = getDB().prepare("SELECT * FROM HD_HOLIDAY_WORK WHERE Holiday_Work_Id = ?").get(started.Holiday_Work_Id);
        assert.equal(still.Ended_Time, null);

        at("2026-05-02T09:00", () => holidayWorkService.closeOverdueTimers());
        const row = getDB().prepare("SELECT * FROM HD_HOLIDAY_WORK WHERE Holiday_Work_Id = ?").get(started.Holiday_Work_Id);
        assert.equal(row.Ended_Time, ist("2026-05-02T00:00"));
        assert.equal(row.Minutes, 120);
    } finally {
        mock.timers.reset();
    }
});

test("stopping a timer the morning after caps it at the holiday's midnight", () => {
    const admin = agentWithRole("ADMIN");
    const actor = { agentId: admin.Agent_Id, permissions: ALL_PERMISSION_KEYS };
    mock.timers.enable({ apis: ["Date"], now: new Date(ist("2026-04-30T18:00")) });
    try {
        const ticket = at("2026-04-30T18:00", () => createTicket({ bankId: monFriBank.Bank_Id, priority: "P1", status: "In Progress" }));
        at("2026-05-01T23:00", () => holidayWorkService.startTimer(ticket.Ticket_Id, actor));
        const stopped = at("2026-05-02T08:00", () => holidayWorkService.stopTimer(ticket.Ticket_Id, actor));
        assert.equal(stopped.Ended_Time, ist("2026-05-02T00:00"));
        assert.equal(stopped.Minutes, 60);
    } finally {
        mock.timers.reset();
    }
});
