require("../helpers/env");
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupDatabase, getDB } = require("../helpers/db");
const { startApi } = require("../helpers/api");
const { agentWithRole, signIn, supportTeam, createTicket } = require("../helpers/fixtures");

const fullName = (a) => [a.First_Name, a.Last_Name].filter(Boolean).join(" ");

let api;
let people;
let tokens;

const openAssignmentOf = (ticketId, agentId) => getDB().prepare(
    "SELECT * FROM HD_TICKET_ASSIGNMENT WHERE Ticket_Id = ? AND Agent_Id = ? AND Released_Time IS NULL"
).get(ticketId, agentId);

const stateLogsOf = (assignmentId) => getDB().prepare(
    "SELECT * FROM HD_ASSIGNMENT_STATE_LOG WHERE Assignment_Id = ? ORDER BY rowid"
).all(assignmentId);

const workStateOf = (ticketId, agentId) => openAssignmentOf(ticketId, agentId).Work_State;

const setState = (ticketId, token, agentId, state, note) =>
    api.patch(`/api/v1/tickets/${ticketId}/assignees/${agentId}/state`, token, { state, ...(note ? { note } : {}) });

const waitOn = (ticketId, token, agentId, blockerAgentId) =>
    api.post(`/api/v1/tickets/${ticketId}/assignees/${agentId}/dependencies`, token, { blockerAgentId });

const logWork = (ticketId, token, agentId, body) =>
    api.post(`/api/v1/tickets/${ticketId}/assignees/${agentId}/worklogs`, token, body);

const historyOf = async (ticketId, eventName) => {
    const res = await api.get(`/api/v1/tickets/${ticketId}/history`, tokens.admin);
    assert.equal(res.status, 200);
    return res.body.data.filter((h) => h.Event_Name === eventName);
};

/** A fresh ticket with the given people assigned by the team lead. */
const ticketWith = async (...agents) => {
    const ticket = createTicket();
    const res = await api.post(`/api/v1/tickets/${ticket.Ticket_Id}/assignees`, tokens.leadA, { agentIds: agents.map((a) => a.Agent_Id) });
    assert.equal(res.status, 200);
    return ticket;
};

before(async () => {
    setupDatabase();
    api = await startApi();
    const teamA = supportTeam();
    const used = [];
    const pick = (roleKey, opts = {}) => {
        const agent = agentWithRole(roleKey, { ...opts, exclude: used });
        used.push(agent.Agent_Id);
        return agent;
    };
    const leadA = pick("TEAM_LEAD", { departmentId: teamA.Department_Id });
    const memberA1 = pick("TEAM_MEMBER", { departmentId: teamA.Department_Id });
    const memberA2 = pick("TEAM_MEMBER", { departmentId: teamA.Department_Id });
    const memberA3 = pick("TEAM_MEMBER", { departmentId: teamA.Department_Id });
    const leadB = pick("TEAM_LEAD", { notDepartmentId: teamA.Department_Id });
    const memberB1 = pick("TEAM_MEMBER", { departmentId: leadB.Primary_Department_Id });
    const leadC = pick("TEAM_LEAD", { notDepartmentId: teamA.Department_Id });
    const admin = pick("ADMIN");
    people = { leadA, memberA1, memberA2, memberA3, leadB, memberB1, leadC, admin };
    tokens = Object.fromEntries(Object.entries(people).map(([key, agent]) => [key, signIn(agent)]));
});
after(() => api.close());

describe("per-person work state", () => {
    test("a new assignee starts PENDING with one open state log", async () => {
        const ticket = await ticketWith(people.memberA1);
        const assignment = openAssignmentOf(ticket.Ticket_Id, people.memberA1.Agent_Id);
        assert.equal(assignment.Work_State, "PENDING");
        const logs = stateLogsOf(assignment.Assignment_Id);
        assert.equal(logs.length, 1);
        assert.equal(logs[0].Work_State, "PENDING");
        assert.equal(logs[0].Ended_Time, null);
    });

    test("the assignee moves their work PENDING -> IN_PROGRESS -> ON_HOLD -> DONE, each stretch logged", async () => {
        const ticket = await ticketWith(people.memberA1);
        const agentId = people.memberA1.Agent_Id;
        for (const state of ["IN_PROGRESS", "ON_HOLD", "DONE"]) {
            const res = await setState(ticket.Ticket_Id, tokens.memberA1, agentId, state, `now ${state}`);
            assert.equal(res.status, 200);
            assert.equal(res.body.data.Work_State, state);
        }
        const assignment = openAssignmentOf(ticket.Ticket_Id, agentId);
        const logs = stateLogsOf(assignment.Assignment_Id);
        assert.deepEqual(logs.map((l) => l.Work_State), ["PENDING", "IN_PROGRESS", "ON_HOLD", "DONE"]);
        assert.ok(logs.slice(0, 3).every((l) => l.Ended_Time), "earlier stretches are closed");
        assert.equal(logs[3].Ended_Time, null, "only the current stretch is open");
        assert.equal(logs[1].Note, "now IN_PROGRESS");

        const history = await historyOf(ticket.Ticket_Id, "WORK_STATE_CHANGE");
        assert.deepEqual(history.map((h) => [h.Field_Name, h.Old_Value, h.New_Value, h.Actor_Agent_Id]), [
            [agentId, "PENDING", "IN_PROGRESS", agentId],
            [agentId, "IN_PROGRESS", "ON_HOLD", agentId],
            [agentId, "ON_HOLD", "DONE", agentId]
        ]);
    });

    test("setting the same state again changes nothing", async () => {
        const ticket = await ticketWith(people.memberA1);
        assert.equal((await setState(ticket.Ticket_Id, tokens.memberA1, people.memberA1.Agent_Id, "IN_PROGRESS")).status, 200);
        assert.equal((await setState(ticket.Ticket_Id, tokens.memberA1, people.memberA1.Agent_Id, "IN_PROGRESS")).status, 200);
        assert.equal(stateLogsOf(openAssignmentOf(ticket.Ticket_Id, people.memberA1.Agent_Id).Assignment_Id).length, 2);
    });

    test("automatic states (PENDING, WAITING, READY) cannot be set by hand", async () => {
        const ticket = await ticketWith(people.memberA1);
        for (const state of ["PENDING", "WAITING", "READY", "SOMETHING"]) {
            const res = await setState(ticket.Ticket_Id, tokens.memberA1, people.memberA1.Agent_Id, state);
            assert.equal(res.status, 400, state);
        }
        assert.equal(workStateOf(ticket.Ticket_Id, people.memberA1.Agent_Id), "PENDING");
    });

    test("a co-assignee who did not assign them cannot change someone else's work", async () => {
        const ticket = await ticketWith(people.memberA1, people.memberA2);
        const res = await setState(ticket.Ticket_Id, tokens.memberA2, people.memberA1.Agent_Id, "IN_PROGRESS");
        assert.equal(res.status, 403);
        assert.equal(workStateOf(ticket.Ticket_Id, people.memberA1.Agent_Id), "PENDING");
    });

    test("a Team Lead of an unrelated team cannot change someone's work", async () => {
        const ticket = await ticketWith(people.memberA1, people.memberB1);
        const own = await setState(ticket.Ticket_Id, tokens.leadC, people.memberA1.Agent_Id, "IN_PROGRESS");
        assert.equal(own.status, 403);
        const cross = await setState(ticket.Ticket_Id, tokens.leadC, people.memberB1.Agent_Id, "IN_PROGRESS");
        assert.equal(cross.status, 403);
    });

    test("the ticket team's lead, the assignee's own lead and an Admin can change someone's work", async () => {
        // Assigned by the Admin, so the leads pass on the team rule, not as "whoever assigned them".
        const ticket = createTicket();
        const added = await api.post(`/api/v1/tickets/${ticket.Ticket_Id}/assignees`, tokens.admin, { agentIds: [people.memberA1.Agent_Id, people.memberB1.Agent_Id] });
        assert.equal(added.status, 200);
        assert.equal((await setState(ticket.Ticket_Id, tokens.leadA, people.memberB1.Agent_Id, "IN_PROGRESS")).status, 200);
        assert.equal((await setState(ticket.Ticket_Id, tokens.leadB, people.memberB1.Agent_Id, "ON_HOLD")).status, 200);
        assert.equal((await setState(ticket.Ticket_Id, tokens.admin, people.memberA1.Agent_Id, "IN_PROGRESS")).status, 200);
        const log = stateLogsOf(openAssignmentOf(ticket.Ticket_Id, people.memberB1.Agent_Id).Assignment_Id);
        assert.deepEqual(log.map((l) => l.Actor_Agent_Id), [people.admin.Agent_Id, people.leadA.Agent_Id, people.leadB.Agent_Id]);
    });

    test("changing the work of someone not on the ticket answers 404", async () => {
        const ticket = await ticketWith(people.memberA1);
        const res = await setState(ticket.Ticket_Id, tokens.admin, people.memberA3.Agent_Id, "IN_PROGRESS");
        assert.equal(res.status, 404);
    });
});

describe("waiting on another assignee", () => {
    test("the waiting assignee becomes WAITING and cannot start while blocked", async () => {
        const ticket = await ticketWith(people.memberA1, people.memberB1);
        const res = await waitOn(ticket.Ticket_Id, tokens.memberA1, people.memberA1.Agent_Id, people.memberB1.Agent_Id);
        assert.equal(res.status, 200);
        assert.equal(res.body.data.Work_State, "WAITING");

        const start = await setState(ticket.Ticket_Id, tokens.memberA1, people.memberA1.Agent_Id, "IN_PROGRESS");
        assert.equal(start.status, 400);
        assert.ok(start.body.error.message.includes(fullName(people.memberB1)), start.body.error.message);
        assert.equal(workStateOf(ticket.Ticket_Id, people.memberA1.Agent_Id), "WAITING");

        const history = await historyOf(ticket.Ticket_Id, "DEPENDENCY_ADDED");
        assert.deepEqual(history.map((h) => [h.Field_Name, h.New_Value, h.Actor_Agent_Id]), [
            [people.memberA1.Agent_Id, people.memberB1.Agent_Id, people.memberA1.Agent_Id]
        ]);
    });

    test("the waiting assignee becomes READY when the blocker is DONE, and can then start", async () => {
        const ticket = await ticketWith(people.memberA1, people.memberB1);
        assert.equal((await waitOn(ticket.Ticket_Id, tokens.leadA, people.memberA1.Agent_Id, people.memberB1.Agent_Id)).status, 200);
        assert.equal((await setState(ticket.Ticket_Id, tokens.memberB1, people.memberB1.Agent_Id, "IN_PROGRESS")).status, 200);
        assert.equal(workStateOf(ticket.Ticket_Id, people.memberA1.Agent_Id), "WAITING", "still waiting while the blocker works");
        assert.equal((await setState(ticket.Ticket_Id, tokens.memberB1, people.memberB1.Agent_Id, "DONE")).status, 200);

        assert.equal(workStateOf(ticket.Ticket_Id, people.memberA1.Agent_Id), "READY");
        const unblocked = await historyOf(ticket.Ticket_Id, "WORK_UNBLOCKED");
        assert.equal(unblocked.length, 1);
        assert.equal(unblocked[0].Field_Name, people.memberA1.Agent_Id);

        assert.equal((await setState(ticket.Ticket_Id, tokens.memberA1, people.memberA1.Agent_Id, "IN_PROGRESS")).status, 200);
    });

    test("someone waiting on two people stays WAITING until both are done", async () => {
        const ticket = await ticketWith(people.memberA1, people.memberA2, people.memberB1);
        assert.equal((await waitOn(ticket.Ticket_Id, tokens.leadA, people.memberA1.Agent_Id, people.memberA2.Agent_Id)).status, 200);
        assert.equal((await waitOn(ticket.Ticket_Id, tokens.leadA, people.memberA1.Agent_Id, people.memberB1.Agent_Id)).status, 200);
        assert.equal((await setState(ticket.Ticket_Id, tokens.memberA2, people.memberA2.Agent_Id, "DONE")).status, 200);
        assert.equal(workStateOf(ticket.Ticket_Id, people.memberA1.Agent_Id), "WAITING");
        assert.equal((await setState(ticket.Ticket_Id, tokens.memberB1, people.memberB1.Agent_Id, "DONE")).status, 200);
        assert.equal(workStateOf(ticket.Ticket_Id, people.memberA1.Agent_Id), "READY");
    });

    test("the waiting assignee becomes READY when the blocker is released", async () => {
        const ticket = await ticketWith(people.memberA1, people.memberB1);
        assert.equal((await waitOn(ticket.Ticket_Id, tokens.leadA, people.memberA1.Agent_Id, people.memberB1.Agent_Id)).status, 200);
        const released = await api.delete(`/api/v1/tickets/${ticket.Ticket_Id}/assignees/${people.memberB1.Agent_Id}`, tokens.memberB1);
        assert.equal(released.status, 200);
        assert.equal(workStateOf(ticket.Ticket_Id, people.memberA1.Agent_Id), "READY");
    });

    test("removing the dependency makes the waiting assignee READY", async () => {
        const ticket = await ticketWith(people.memberA1, people.memberB1);
        assert.equal((await waitOn(ticket.Ticket_Id, tokens.leadA, people.memberA1.Agent_Id, people.memberB1.Agent_Id)).status, 200);
        const res = await api.delete(`/api/v1/tickets/${ticket.Ticket_Id}/assignees/${people.memberA1.Agent_Id}/dependencies/${people.memberB1.Agent_Id}`, tokens.memberA1);
        assert.equal(res.status, 200);
        assert.equal(res.body.data.Work_State, "READY");
        assert.equal((await historyOf(ticket.Ticket_Id, "DEPENDENCY_REMOVED")).length, 1);
    });

    test("waiting on someone already DONE does not block", async () => {
        const ticket = await ticketWith(people.memberA1, people.memberB1);
        assert.equal((await setState(ticket.Ticket_Id, tokens.memberB1, people.memberB1.Agent_Id, "DONE")).status, 200);
        const res = await waitOn(ticket.Ticket_Id, tokens.leadA, people.memberA1.Agent_Id, people.memberB1.Agent_Id);
        assert.equal(res.status, 200);
        assert.equal(res.body.data.Work_State, "PENDING");
    });

    test("loops, waiting on yourself and waiting twice on the same person are refused", async () => {
        const ticket = await ticketWith(people.memberA1, people.memberA2, people.memberB1);
        const { Ticket_Id: id } = ticket;
        assert.equal((await waitOn(id, tokens.leadA, people.memberA1.Agent_Id, people.memberA2.Agent_Id)).status, 200);
        assert.equal((await waitOn(id, tokens.leadA, people.memberA2.Agent_Id, people.memberB1.Agent_Id)).status, 200);

        const direct = await waitOn(id, tokens.leadA, people.memberA2.Agent_Id, people.memberA1.Agent_Id);
        assert.equal(direct.status, 400);
        assert.match(direct.body.error.message, /loop/);
        const indirect = await waitOn(id, tokens.leadA, people.memberB1.Agent_Id, people.memberA1.Agent_Id);
        assert.equal(indirect.status, 400);
        assert.match(indirect.body.error.message, /loop/);

        const self = await waitOn(id, tokens.leadA, people.memberA1.Agent_Id, people.memberA1.Agent_Id);
        assert.equal(self.status, 400);
        const twice = await waitOn(id, tokens.leadA, people.memberA1.Agent_Id, people.memberA2.Agent_Id);
        assert.equal(twice.status, 400);

        const edges = getDB().prepare("SELECT COUNT(*) n FROM HD_ASSIGNMENT_DEPENDENCY WHERE Ticket_Id = ?").get(id).n;
        assert.equal(edges, 2);
    });

    test("a co-assignee cannot make someone else wait", async () => {
        const ticket = await ticketWith(people.memberA1, people.memberA2);
        const res = await waitOn(ticket.Ticket_Id, tokens.memberA2, people.memberA1.Agent_Id, people.memberA2.Agent_Id);
        assert.equal(res.status, 403);
    });
});

describe("closing needs every assignee's work done", () => {
    const close = (ticketId, status = "Closed") => api.patch(`/api/v1/tickets/${ticketId}`, tokens.leadA, { status });

    test("closing is refused while an assignee is not DONE, naming who", async () => {
        const ticket = await ticketWith(people.memberA1, people.memberB1);
        assert.equal((await setState(ticket.Ticket_Id, tokens.memberA1, people.memberA1.Agent_Id, "DONE")).status, 200);
        const res = await close(ticket.Ticket_Id);
        assert.equal(res.status, 400);
        assert.ok(res.body.error.message.includes(fullName(people.memberB1)), res.body.error.message);
        assert.ok(!res.body.error.message.includes(fullName(people.memberA1)), "people already done are not named");
        const detail = await api.get(`/api/v1/tickets/${ticket.Ticket_Id}`, tokens.leadA);
        assert.notEqual(detail.body.data.Status, "Closed");
    });

    test("closing is allowed once every current assignee is DONE", async () => {
        const ticket = await ticketWith(people.memberA1, people.memberB1);
        assert.equal((await setState(ticket.Ticket_Id, tokens.memberA1, people.memberA1.Agent_Id, "DONE")).status, 200);
        assert.equal((await setState(ticket.Ticket_Id, tokens.memberB1, people.memberB1.Agent_Id, "DONE")).status, 200);
        const res = await close(ticket.Ticket_Id);
        assert.equal(res.status, 200);
        assert.equal(res.body.data.Status, "Closed");
    });

    test("a released assignee who never finished does not block closing", async () => {
        const ticket = await ticketWith(people.memberA1, people.memberB1);
        assert.equal((await setState(ticket.Ticket_Id, tokens.memberA1, people.memberA1.Agent_Id, "DONE")).status, 200);
        assert.equal((await api.delete(`/api/v1/tickets/${ticket.Ticket_Id}/assignees/${people.memberB1.Agent_Id}`, tokens.leadA)).status, 200);
        assert.equal((await close(ticket.Ticket_Id)).status, 200);
    });

    // Only statuses whose clock is STOPPED (seed: "Closed") are gated; "Resolved" keeps the clock running.
    test("moving to Resolved is not gated (its clock keeps running)", async () => {
        const ticket = await ticketWith(people.memberA1);
        const res = await close(ticket.Ticket_Id, "Resolved");
        assert.equal(res.status, 200);
        assert.equal(res.body.data.Status, "Resolved");
    });
});

describe("work log and tracking totals", () => {
    let ticket;
    let leadLogId;
    before(async () => {
        ticket = await ticketWith(people.memberA1, people.memberA2, people.memberB1);
    });

    test("an assignee logs minutes with a note against their own work", async () => {
        const res = await logWork(ticket.Ticket_Id, tokens.memberA1, people.memberA1.Agent_Id, { minutes: 30, note: "Checked the logs" });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.Minutes, 30);
        assert.equal(res.body.data.Note, "Checked the logs");
        assert.equal(res.body.data.Agent_Id, people.memberA1.Agent_Id);
        assert.equal(res.body.data.Logged_By, people.memberA1.Agent_Id);
        assert.match(res.body.data.Work_Date, /^\d{4}-\d{2}-\d{2}$/, "defaults to today's date");

        const history = await historyOf(ticket.Ticket_Id, "WORKLOG_ADDED");
        assert.equal(history.length, 1);
        assert.equal(history[0].Field_Name, people.memberA1.Agent_Id);
        assert.equal(Number(history[0].New_Value), 30);
    });

    test("more work is logged by the assignee, a cross-team assignee and the team lead", async () => {
        assert.equal((await logWork(ticket.Ticket_Id, tokens.memberA1, people.memberA1.Agent_Id, { minutes: 15 })).status, 200);
        assert.equal((await logWork(ticket.Ticket_Id, tokens.memberB1, people.memberB1.Agent_Id, { minutes: 45 })).status, 200);
        const byLead = await logWork(ticket.Ticket_Id, tokens.leadA, people.memberA2.Agent_Id, { minutes: 20, note: "Logged by lead" });
        assert.equal(byLead.status, 200);
        assert.equal(byLead.body.data.Agent_Id, people.memberA2.Agent_Id);
        assert.equal(byLead.body.data.Logged_By, people.leadA.Agent_Id);
        leadLogId = byLead.body.data.Worklog_Id;
    });

    test("a co-assignee cannot log work against someone else", async () => {
        const res = await logWork(ticket.Ticket_Id, tokens.memberA2, people.memberA1.Agent_Id, { minutes: 10 });
        assert.equal(res.status, 403);
    });

    test("invalid minutes are refused", async () => {
        for (const minutes of [0, -5, 1.5, 24 * 60 + 1]) {
            const res = await logWork(ticket.Ticket_Id, tokens.memberA1, people.memberA1.Agent_Id, { minutes });
            assert.equal(res.status, 400, `minutes ${minutes}`);
        }
    });

    test("a work date sent by the client is stored as a plain date",
        { todo: "BUG: Joi isoDate() (schemas/ticket.schema.js:86) converts \"2026-10-01\" to a UTC \"...T00:00:00.000Z\" timestamp in Work_Date" },
        async () => {
            const other = await ticketWith(people.memberA3);
            const res = await logWork(other.Ticket_Id, tokens.memberA3, people.memberA3.Agent_Id, { minutes: 5, workDate: "2026-10-01" });
            assert.equal(res.status, 200);
            assert.equal(res.body.data.Work_Date, "2026-10-01");
        });

    test("only the person who logged an entry can delete it", async () => {
        const byAssignee = await api.delete(`/api/v1/tickets/${ticket.Ticket_Id}/worklogs/${leadLogId}`, tokens.memberA2);
        assert.equal(byAssignee.status, 403, "the assignee the work was logged for cannot delete the lead's entry");
        const byAdmin = await api.delete(`/api/v1/tickets/${ticket.Ticket_Id}/worklogs/${leadLogId}`, tokens.admin);
        assert.equal(byAdmin.status, 403);

        const temp = await logWork(ticket.Ticket_Id, tokens.memberA1, people.memberA1.Agent_Id, { minutes: 99 });
        const own = await api.delete(`/api/v1/tickets/${ticket.Ticket_Id}/worklogs/${temp.body.data.Worklog_Id}`, tokens.memberA1);
        assert.equal(own.status, 200);
        assert.equal(own.body.data.deleted, true);
        const again = await api.delete(`/api/v1/tickets/${ticket.Ticket_Id}/worklogs/${temp.body.data.Worklog_Id}`, tokens.memberA1);
        assert.equal(again.status, 404);
    });

    test("a work log of another ticket cannot be deleted through this ticket", async () => {
        const other = await ticketWith(people.memberA1);
        const res = await api.delete(`/api/v1/tickets/${other.Ticket_Id}/worklogs/${leadLogId}`, tokens.leadA);
        assert.equal(res.status, 404);
    });

    test("tracking totals include logged minutes per person, per team and in total (deleted entries excluded)", async () => {
        const res = await api.get(`/api/v1/tickets/${ticket.Ticket_Id}/tracking`, tokens.memberA3);
        assert.equal(res.status, 200);
        const { lanes, summary } = res.body.data;

        const laneOf = (agent) => lanes.find((l) => l.agentId === agent.Agent_Id);
        assert.equal(laneOf(people.memberA1).loggedMinutes, 45);
        assert.equal(laneOf(people.memberA2).loggedMinutes, 20);
        assert.equal(laneOf(people.memberB1).loggedMinutes, 45);
        assert.equal(laneOf(people.memberB1).crossTeam, true);
        assert.equal(laneOf(people.memberA1).crossTeam, false);

        const personOf = (agent) => summary.perPerson.find((p) => p.agentId === agent.Agent_Id);
        assert.equal(personOf(people.memberA1).logged, 45);
        assert.equal(personOf(people.memberA2).logged, 20);
        assert.equal(personOf(people.memberB1).logged, 45);

        const teamOf = (teamId) => summary.perTeam.find((t) => t.teamId === teamId);
        assert.equal(teamOf(people.memberA1.Primary_Department_Id).logged, 65);
        assert.equal(teamOf(people.memberB1.Primary_Department_Id).logged, 45);
        assert.equal(summary.loggedMinutes, 110);

        assert.equal(summary.current.length, 3);
        const worklogEvents = res.body.data.events.filter((e) => e.type === "WORKLOG");
        assert.equal(worklogEvents.length, 5, "one event per WORKLOG_ADDED history row, deleted ones included");
    });
});
