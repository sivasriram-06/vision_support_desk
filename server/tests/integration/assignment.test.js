require("../helpers/env");
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupDatabase, getDB } = require("../helpers/db");
const { startApi } = require("../helpers/api");
const { agentWithRole, signIn, supportTeam, createTicket } = require("../helpers/fixtures");

const fullName = (a) => [a.First_Name, a.Last_Name].filter(Boolean).join(" ");

let api;
let teamA;
let people;
let tokens;

/** The seed has no Assistant Team Lead, so one Team A member is given that role in this test DB. */
const promoteTo = (agent, roleKey) => {
    getDB().prepare(
        `UPDATE HD_AGENT_MASTER SET Role_Id = (SELECT Role_Id FROM HD_ROLE_MASTER WHERE Role_Key = ?) WHERE Agent_Id = ?`
    ).run(roleKey, agent.Agent_Id);
    return { ...agent, Role_Key: roleKey };
};

const openAssignments = (ticketId) => getDB().prepare(
    "SELECT * FROM HD_TICKET_ASSIGNMENT WHERE Ticket_Id = ? AND Released_Time IS NULL ORDER BY Assigned_Time"
).all(ticketId);

const openAssignmentOf = (ticketId, agentId) => openAssignments(ticketId).find((a) => a.Agent_Id === agentId);

const assign = (ticketId, token, agentIds, note) =>
    api.post(`/api/v1/tickets/${ticketId}/assignees`, token, { agentIds, ...(note ? { note } : {}) });

const release = (ticketId, token, agentId) => api.delete(`/api/v1/tickets/${ticketId}/assignees/${agentId}`, token);

const historyOf = async (ticketId, eventName) => {
    const res = await api.get(`/api/v1/tickets/${ticketId}/history`, tokens.admin);
    assert.equal(res.status, 200);
    return res.body.data.filter((h) => h.Event_Name === eventName);
};

const counts = async (token) => {
    const res = await api.get("/api/v1/tickets/my/counts", token);
    assert.equal(res.status, 200);
    return res.body.data;
};

const myTickets = async (token, scope, includeClosed) => {
    const query = `scope=${scope}${includeClosed ? "&includeClosed=true" : ""}`;
    const res = await api.get(`/api/v1/tickets/my?${query}`, token);
    assert.equal(res.status, 200);
    return res.body.data;
};

before(async () => {
    setupDatabase();
    api = await startApi();
    teamA = supportTeam();
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
    const assistantA = promoteTo(pick("TEAM_MEMBER", { departmentId: teamA.Department_Id }), "ASSISTANT_TEAM_LEAD");
    const leadB = pick("TEAM_LEAD", { notDepartmentId: teamA.Department_Id });
    const memberB1 = pick("TEAM_MEMBER", { departmentId: leadB.Primary_Department_Id });
    const memberB2 = pick("TEAM_MEMBER", { departmentId: leadB.Primary_Department_Id });
    const leadC = pick("TEAM_LEAD", { notDepartmentId: teamA.Department_Id, exclude: used });
    assert.notEqual(leadC.Primary_Department_Id, leadB.Primary_Department_Id);
    const admin = pick("ADMIN");
    const manager = pick("MANAGER");
    people = { leadA, memberA1, memberA2, memberA3, assistantA, leadB, memberB1, memberB2, leadC, admin, manager };
    tokens = Object.fromEntries(Object.entries(people).map(([key, agent]) => [key, signIn(agent)]));
});
after(() => api.close());

describe("first assignment of an unassigned ticket", () => {
    test("a Team Member cannot make the first assignment, not even of themselves", async () => {
        const ticket = createTicket();
        for (const agentIds of [[people.memberA2.Agent_Id], [people.memberA1.Agent_Id]]) {
            const res = await assign(ticket.Ticket_Id, tokens.memberA1, agentIds);
            assert.equal(res.status, 403);
            assert.match(res.body.error.message, /first assignment/i);
        }
        assert.equal(openAssignments(ticket.Ticket_Id).length, 0);
    });

    for (const role of ["admin", "manager", "leadA", "assistantA"]) {
        test(`${role === "leadA" ? "a Team Lead" : role === "assistantA" ? "an Assistant Team Lead" : `a ${role[0].toUpperCase()}${role.slice(1)}`} can make the first assignment`, async () => {
            const ticket = createTicket();
            const res = await assign(ticket.Ticket_Id, tokens[role], [people.memberA1.Agent_Id], "Please pick this up");
            assert.equal(res.status, 200);
            const rows = openAssignments(ticket.Ticket_Id);
            assert.equal(rows.length, 1);
            assert.equal(rows[0].Agent_Id, people.memberA1.Agent_Id);
            assert.equal(rows[0].Assigned_By, people[role].Agent_Id);
            assert.equal(rows[0].Is_Cross_Team, "N");
            assert.equal(rows[0].Work_State, "PENDING");
            assert.equal(rows[0].Note, "Please pick this up");
        });
    }

    test("the first assignee moves a ticket out of the Unassigned status to Open", async () => {
        const ticket = createTicket({ status: "Unassigned" });
        assert.equal(ticket.Status, "Unassigned");
        const res = await assign(ticket.Ticket_Id, tokens.leadA, [people.memberA1.Agent_Id]);
        assert.equal(res.status, 200);
        const detail = await api.get(`/api/v1/tickets/${ticket.Ticket_Id}`, tokens.leadA);
        assert.equal(detail.body.data.Status, "Open");
    });

    // tickets.assign_team is labelled "Assign within own team"; assertCanAssign
    // returns early for either assign permission without looking at the team.
    test("a Team Lead cannot make the first assignment to an agent of another team",
        { todo: "BUG: assertCanAssign (ticket-assignment.service.js:73) lets tickets.assign_team assign anyone in any team" },
        async () => {
            const ticket = createTicket();
            const res = await assign(ticket.Ticket_Id, tokens.leadA, [people.memberB1.Agent_Id]);
            assert.equal(res.status, 403);
            assert.equal(openAssignments(ticket.Ticket_Id).length, 0);
        });
});

describe("adding more assignees", () => {
    let ticket;
    before(async () => {
        ticket = createTicket();
        const res = await assign(ticket.Ticket_Id, tokens.leadA, [people.memberA1.Agent_Id]);
        assert.equal(res.status, 200);
    });

    test("a current assignee can bring in someone from their own team (not cross-team)", async () => {
        const res = await assign(ticket.Ticket_Id, tokens.memberA1, [people.memberA2.Agent_Id]);
        assert.equal(res.status, 200);
        const row = openAssignmentOf(ticket.Ticket_Id, people.memberA2.Agent_Id);
        assert.equal(row.Is_Cross_Team, "N");
        assert.equal(row.Assigned_By, people.memberA1.Agent_Id);
    });

    test("a current assignee can bring in someone from another team, marked cross-team", async () => {
        const res = await assign(ticket.Ticket_Id, tokens.memberA1, [people.memberB1.Agent_Id]);
        assert.equal(res.status, 200);
        const row = openAssignmentOf(ticket.Ticket_Id, people.memberB1.Agent_Id);
        assert.equal(row.Is_Cross_Team, "Y");
        assert.equal(row.Department_Id, people.memberB1.Primary_Department_Id);
        const listed = res.body.data.find((a) => a.Agent_Id === people.memberB1.Agent_Id);
        assert.equal(listed.Is_Cross_Team, "Y");
    });

    test("a Team Member who is not on the ticket cannot add people", async () => {
        const res = await assign(ticket.Ticket_Id, tokens.memberA3, [people.memberA3.Agent_Id]);
        assert.equal(res.status, 403);
        assert.match(res.body.error.message, /Only people assigned/);
        assert.equal(openAssignmentOf(ticket.Ticket_Id, people.memberA3.Agent_Id), undefined);
    });

    test("the same person twice in one request is refused", async () => {
        const res = await assign(ticket.Ticket_Id, tokens.leadA, [people.memberA3.Agent_Id, people.memberA3.Agent_Id]);
        assert.equal(res.status, 400);
        assert.equal(openAssignmentOf(ticket.Ticket_Id, people.memberA3.Agent_Id), undefined);
    });

    test("assigning someone already on the ticket never creates a second assignment", async () => {
        const before = openAssignments(ticket.Ticket_Id).length;
        const res = await assign(ticket.Ticket_Id, tokens.leadA, [people.memberA1.Agent_Id]);
        // The service skips people already assigned (200) rather than refusing.
        assert.ok([200, 400, 409].includes(res.status), `status ${res.status}`);
        assert.equal(openAssignments(ticket.Ticket_Id).length, before);
        assert.equal(openAssignments(ticket.Ticket_Id).filter((a) => a.Agent_Id === people.memberA1.Agent_Id).length, 1);
    });

    test("assigning someone already on the ticket is refused", { todo: "BUG?: addAssignees silently skips an already-assigned agent (ticket-assignment.service.js:127) and answers 200" }, async () => {
        const res = await assign(ticket.Ticket_Id, tokens.leadA, [people.memberA1.Agent_Id]);
        assert.ok([400, 409].includes(res.status), `status ${res.status}`);
    });

    test("an unknown agent id is refused", async () => {
        const res = await assign(ticket.Ticket_Id, tokens.leadA, ["no-such-agent"]);
        assert.equal(res.status, 400);
        assert.equal(res.body.error.code, "AGENT_NOT_FOUND");
    });

    test("each addition writes an ASSIGNEE_ADDED history row naming the assignee and who added them", async () => {
        const rows = await historyOf(ticket.Ticket_Id, "ASSIGNEE_ADDED");
        const added = rows.map((h) => [h.New_Value, h.Actor_Agent_Id]);
        assert.deepEqual(added, [
            [people.memberA1.Agent_Id, people.leadA.Agent_Id],
            [people.memberA2.Agent_Id, people.memberA1.Agent_Id],
            [people.memberB1.Agent_Id, people.memberA1.Agent_Id]
        ]);
    });
});

describe("removing assignees", () => {
    let ticket;
    before(async () => {
        ticket = createTicket();
        assert.equal((await assign(ticket.Ticket_Id, tokens.leadA, [people.memberA1.Agent_Id, people.memberA2.Agent_Id])).status, 200);
        // memberA1 brings in two cross-team people; memberA2 did not assign anyone.
        assert.equal((await assign(ticket.Ticket_Id, tokens.memberA1, [people.memberB1.Agent_Id, people.memberB2.Agent_Id])).status, 200);
    });

    test("a co-assignee who did not assign someone cannot remove them", async () => {
        const res = await release(ticket.Ticket_Id, tokens.memberA2, people.memberB1.Agent_Id);
        assert.equal(res.status, 403);
        assert.ok(openAssignmentOf(ticket.Ticket_Id, people.memberB1.Agent_Id));
    });

    test("a Team Lead of an unrelated team cannot remove anyone", async () => {
        const res = await release(ticket.Ticket_Id, tokens.leadC, people.memberB1.Agent_Id);
        assert.equal(res.status, 403);
        const own = await release(ticket.Ticket_Id, tokens.leadC, people.memberA2.Agent_Id);
        assert.equal(own.status, 403);
    });

    test("a lead of the ticket's own team can remove a cross-team assignee", async () => {
        const res = await release(ticket.Ticket_Id, tokens.leadA, people.memberB1.Agent_Id);
        assert.equal(res.status, 200);
        assert.equal(openAssignmentOf(ticket.Ticket_Id, people.memberB1.Agent_Id), undefined);
        const row = getDB().prepare("SELECT * FROM HD_TICKET_ASSIGNMENT WHERE Ticket_Id = ? AND Agent_Id = ?").get(ticket.Ticket_Id, people.memberB1.Agent_Id);
        assert.equal(row.Released_By, people.leadA.Agent_Id);
        assert.ok(row.Released_Time);
    });

    test("whoever assigned someone can remove them", async () => {
        const res = await release(ticket.Ticket_Id, tokens.memberA1, people.memberB2.Agent_Id);
        assert.equal(res.status, 200);
    });

    test("an assignee can release themselves", async () => {
        const res = await release(ticket.Ticket_Id, tokens.memberA2, people.memberA2.Agent_Id);
        assert.equal(res.status, 200);
        assert.equal(openAssignmentOf(ticket.Ticket_Id, people.memberA2.Agent_Id), undefined);
    });

    test("removing someone who is not assigned answers 404", async () => {
        const res = await release(ticket.Ticket_Id, tokens.leadA, people.memberA3.Agent_Id);
        assert.equal(res.status, 404);
    });

    test("each removal writes an ASSIGNEE_REMOVED history row", async () => {
        const rows = await historyOf(ticket.Ticket_Id, "ASSIGNEE_REMOVED");
        assert.deepEqual(rows.map((h) => [h.Old_Value, h.Actor_Agent_Id]), [
            [people.memberB1.Agent_Id, people.leadA.Agent_Id],
            [people.memberB2.Agent_Id, people.memberA1.Agent_Id],
            [people.memberA2.Agent_Id, people.memberA2.Agent_Id]
        ]);
    });

    test("an Admin can remove anyone", async () => {
        const res = await release(ticket.Ticket_Id, tokens.admin, people.memberA1.Agent_Id);
        assert.equal(res.status, 200);
        assert.equal(openAssignments(ticket.Ticket_Id).length, 0);
    });
});

describe("My Tickets", () => {
    test("a new assignment shows under the assignee's Assigned tab as new and counts as unseen", async () => {
        const startCounts = await counts(tokens.memberA3);
        const ticket = createTicket({ subject: "My tickets - assigned" });
        assert.equal((await assign(ticket.Ticket_Id, tokens.leadA, [people.memberA3.Agent_Id])).status, 200);

        const mine = await myTickets(tokens.memberA3, "assigned");
        const row = mine.find((t) => t.Ticket_Id === ticket.Ticket_Id);
        assert.ok(row, "ticket listed under Assigned");
        assert.equal(row.My_Is_New, 1);
        assert.equal(row.My_Assigned_By_Name, fullName(people.leadA));

        const afterCounts = await counts(tokens.memberA3);
        assert.equal(afterCounts.assigned, startCounts.assigned + 1);
        assert.equal(afterCounts.unseen, startCounts.unseen + 1);
    });

    test("opening the ticket (seen) clears the new flag and the unseen count, once", async () => {
        const ticket = createTicket({ subject: "My tickets - seen" });
        assert.equal((await assign(ticket.Ticket_Id, tokens.leadA, [people.memberA2.Agent_Id])).status, 200);
        const unseenBefore = (await counts(tokens.memberA2)).unseen;

        const seen = await api.post(`/api/v1/tickets/${ticket.Ticket_Id}/assignees/seen`, tokens.memberA2);
        assert.equal(seen.status, 200);
        assert.equal(seen.body.data.updated, true);
        assert.equal((await counts(tokens.memberA2)).unseen, unseenBefore - 1);
        const row = (await myTickets(tokens.memberA2, "assigned")).find((t) => t.Ticket_Id === ticket.Ticket_Id);
        assert.equal(row.My_Is_New, 0);

        const again = await api.post(`/api/v1/tickets/${ticket.Ticket_Id}/assignees/seen`, tokens.memberA2);
        assert.equal(again.body.data.updated, false);
    });

    test("someone else opening the ticket does not clear the assignee's new flag", async () => {
        const ticket = createTicket({ subject: "My tickets - other viewer" });
        assert.equal((await assign(ticket.Ticket_Id, tokens.leadA, [people.memberA2.Agent_Id])).status, 200);
        const res = await api.post(`/api/v1/tickets/${ticket.Ticket_Id}/assignees/seen`, tokens.leadA);
        assert.equal(res.body.data.updated, false);
        assert.equal(openAssignmentOf(ticket.Ticket_Id, people.memberA2.Agent_Id).Seen_Time, null);
    });

    test("assigning yourself is already seen", async () => {
        const startUnseen = (await counts(tokens.leadA)).unseen;
        const ticket = createTicket({ subject: "My tickets - self" });
        assert.equal((await assign(ticket.Ticket_Id, tokens.leadA, [people.leadA.Agent_Id])).status, 200);
        assert.ok(openAssignmentOf(ticket.Ticket_Id, people.leadA.Agent_Id).Seen_Time);
        assert.equal((await counts(tokens.leadA)).unseen, startUnseen);
        const row = (await myTickets(tokens.leadA, "assigned")).find((t) => t.Ticket_Id === ticket.Ticket_Id);
        assert.equal(row.My_Is_New, 0);
    });

    test("the person who assigned sees the ticket under Assigned by me (not for self-assignment)", async () => {
        const startCount = (await counts(tokens.manager)).assignedBy;
        const ticket = createTicket({ subject: "My tickets - assigned by" });
        const self = createTicket({ subject: "My tickets - manager self" });
        assert.equal((await assign(ticket.Ticket_Id, tokens.manager, [people.memberA1.Agent_Id])).status, 200);
        assert.equal((await assign(self.Ticket_Id, tokens.manager, [people.manager.Agent_Id])).status, 200);

        const list = await myTickets(tokens.manager, "assignedBy");
        assert.ok(list.some((t) => t.Ticket_Id === ticket.Ticket_Id));
        assert.ok(!list.some((t) => t.Ticket_Id === self.Ticket_Id));
        assert.equal((await counts(tokens.manager)).assignedBy, startCount + 1);
    });

    test("the Team tab shows tickets of the team and tickets a team member works cross-team", async () => {
        const ownTeam = createTicket({ subject: "My tickets - team A" });
        const crossTeam = createTicket({ subject: "My tickets - cross team" });
        assert.equal((await assign(crossTeam.Ticket_Id, tokens.leadA, [people.memberB1.Agent_Id])).status, 200);

        const teamA = await myTickets(tokens.memberA1, "team");
        assert.ok(teamA.some((t) => t.Ticket_Id === ownTeam.Ticket_Id));
        const teamB = await myTickets(tokens.memberB2, "team");
        assert.ok(teamB.some((t) => t.Ticket_Id === crossTeam.Ticket_Id), "team B sees the ticket its member works");
        assert.ok(!teamB.some((t) => t.Ticket_Id === ownTeam.Ticket_Id), "team B does not see team A's other tickets");
    });

    test("a released assignee no longer has the ticket under Assigned", async () => {
        const ticket = createTicket({ subject: "My tickets - released" });
        assert.equal((await assign(ticket.Ticket_Id, tokens.leadA, [people.memberA1.Agent_Id])).status, 200);
        assert.ok((await myTickets(tokens.memberA1, "assigned")).some((t) => t.Ticket_Id === ticket.Ticket_Id));
        assert.equal((await release(ticket.Ticket_Id, tokens.memberA1, people.memberA1.Agent_Id)).status, 200);
        assert.ok(!(await myTickets(tokens.memberA1, "assigned")).some((t) => t.Ticket_Id === ticket.Ticket_Id));
    });

    test("closed tickets leave My Tickets unless closed ones are included", async () => {
        const ticket = createTicket({ subject: "My tickets - closed" });
        assert.equal((await assign(ticket.Ticket_Id, tokens.leadA, [people.memberB2.Agent_Id])).status, 200);
        const unseenBefore = (await counts(tokens.memberB2)).unseen;
        const done = await api.patch(`/api/v1/tickets/${ticket.Ticket_Id}/assignees/${people.memberB2.Agent_Id}/state`, tokens.memberB2, { state: "DONE" });
        assert.equal(done.status, 200);
        const closed = await api.patch(`/api/v1/tickets/${ticket.Ticket_Id}`, tokens.leadA, { status: "Closed" });
        assert.equal(closed.status, 200);

        assert.ok(!(await myTickets(tokens.memberB2, "assigned")).some((t) => t.Ticket_Id === ticket.Ticket_Id));
        assert.ok((await myTickets(tokens.memberB2, "assigned", true)).some((t) => t.Ticket_Id === ticket.Ticket_Id));
        assert.equal((await counts(tokens.memberB2)).unseen, unseenBefore - 1, "unseen counts open tickets only");
    });

    test("an invalid scope is refused", async () => {
        const res = await api.get("/api/v1/tickets/my?scope=everyone", tokens.memberA1);
        assert.equal(res.status, 400);
    });
});
