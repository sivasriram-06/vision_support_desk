const { connectDB, closeDB, getDB } = require("../config/db");
const env = require("../config/env");
const logger = require("../utils/logger");
const generateId = require("../utils/generate-id");
const organizationRepository = require("../repositories/organization.repository");
const bankRepository = require("../repositories/bank.repository");
const picklistRepository = require("../repositories/picklist.repository");
const prioritySlaRepository = require("../repositories/priority-sla.repository");
const ticketRepository = require("../repositories/ticket.repository");
const { history: historyRepository, metrics: metricsRepository } = require("../repositories/history.repository");
const { computeSlaDueDate } = require("../services/sla/sla.service");
const resolutionClock = require("../services/sla/resolution-clock.service");
const escalationService = require("../services/sla/escalation.service");
const { getCalendar } = require("../services/sla/business-calendar");
const { SYSTEM_AGENT_EMAIL } = require("../services/organization.service");
const DB_TABLES = require("../constants/db-tables");
const { TICKET_HISTORY_EVENT, CLOCK_BEHAVIOUR } = require("../constants/ticket.constants");

/**
 * DEMO DATA - test environments only. Rewrites every ticket with a random
 * bank (and its support team), an assignee from that team, a priority,
 * classification/category and a status, and replays a believable
 * timeline to reach that status (assigned -> In Progress -> maybe waiting
 * on the bank -> resolved ...) with back-dated timestamps, so SLA due
 * dates, resolution-clock segments and status history all look real.
 *
 * Created_Time is spread over the last DEMO_WINDOW_DAYS so the board shows
 * a mix of on-time / due-soon / overdue tickets. Email send times in the
 * conversation are untouched.
 *
 * Deterministic (seeded RNG): the same seed gives the same demo.
 * Usage: npm run seed:demo [-- --seed=42]
 */
const DEMO_WINDOW_DAYS = 10;
const MINUTE = 60 * 1000;

// Weighted picks. Unassigned is left out on purpose: every demo ticket is assigned.
const STATUS_WEIGHTS = {
    Open: 10,
    "In Progress": 22,
    "In Progress - Client": 12,
    "On Hold - Client": 10,
    "On Hold - Dependent": 8,
    Resolved: 18,
    "Resolved - Under Observation": 8,
    Closed: 12
};
const PRIORITY_WEIGHTS = { P1: 20, P2: 40, P3: 40 };

const mulberry32 = (seed) => () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const seedArg = process.argv.find((arg) => arg.startsWith("--seed="));
const random = mulberry32(seedArg ? Number(seedArg.split("=")[1]) : 20260924);
const pick = (list) => list[Math.floor(random() * list.length)];
const weighted = (weights, allowed) => {
    const entries = Object.entries(weights).filter(([key]) => allowed.includes(key));
    let roll = random() * entries.reduce((sum, [, w]) => sum + w, 0);
    for (const [key, w] of entries) {
        roll -= w;
        if (roll <= 0) return key;
    }
    return entries[entries.length - 1][0];
};
const between = (minMinutes, maxMinutes) => (minMinutes + random() * (maxMinutes - minMinutes)) * MINUTE;

/** Status steps a ticket goes through to end up in `target`. */
const buildPath = (target, behaviourOf) => {
    const behaviour = behaviourOf(target);
    const paused = ["In Progress - Client", "On Hold - Client", "On Hold - Dependent"];
    if (behaviour === CLOCK_BEHAVIOUR.NOT_STARTED) return [target];
    const path = ["In Progress"];
    // Some tickets wait on the bank once before finishing.
    if (behaviour !== CLOCK_BEHAVIOUR.PAUSED && random() < 0.45) path.push(pick(paused), "In Progress");
    if (target !== "In Progress") path.push(target);
    return path;
};

const resetTicketActivity = (db, ticketId) => {
    db.prepare(`DELETE FROM ${DB_TABLES.TICKET_CLOCK_SEGMENT} WHERE Ticket_Id = ?`).run(ticketId);
    db.prepare(`DELETE FROM ${DB_TABLES.TICKET_HISTORY} WHERE Ticket_Id = ? AND Event_Name <> ?`).run(ticketId, TICKET_HISTORY_EVENT.CREATED);
    db.prepare(`UPDATE ${DB_TABLES.TICKET_METRICS} SET Resolution_Time_Mins = NULL, Reopen_Count = 0 WHERE Ticket_Id = ?`).run(ticketId);
};

const logHistory = ({ ticketId, eventName, fieldName, oldValue, newValue, actorAgentId, at, orgId }) => {
    historyRepository.insert({
        History_Id: generateId(),
        Ticket_Id: ticketId,
        Event_Name: eventName,
        Field_Name: fieldName,
        Old_Value: oldValue === null || oldValue === undefined ? null : String(oldValue),
        New_Value: newValue === null || newValue === undefined ? null : String(newValue),
        Actor_Agent_Id: actorAgentId,
        Event_Time: at.toISOString(),
        Created_By: actorAgentId,
        Org_Id: orgId
    });
};

const seedDemoTickets = () => {
    if (env.nodeEnv === "production") {
        throw new Error("seed-demo-tickets rewrites every ticket - refusing to run with NODE_ENV=production");
    }
    const db = connectDB();
    const org = organizationRepository.findFirst();
    const orgId = org.Organization_Id;

    // Banks that have agents on their support team to assign to.
    const agentsByTeam = db.prepare(
        `SELECT a.Agent_Id, a.Primary_Department_Id FROM ${DB_TABLES.AGENT} a
         JOIN ${DB_TABLES.ROLE} r ON r.Role_Id = a.Role_Id AND r.Role_Key IN ('TEAM_LEAD','ASSISTANT_TEAM_LEAD','TEAM_MEMBER')
         WHERE a.Is_Deleted = 'N' AND a.Status = 'Active' AND a.Email <> ?`
    ).all(SYSTEM_AGENT_EMAIL).reduce((map, row) => map.set(row.Primary_Department_Id, [...(map.get(row.Primary_Department_Id) || []), row.Agent_Id]), new Map());
    const banks = bankRepository.findAll(orgId).filter((bank) => agentsByTeam.has(bank.Department_Id));

    const statuses = picklistRepository.findAll(orgId, "STATUS").map((s) => s.Value);
    const behaviourOf = (status) => resolutionClock.clockBehaviourForStatus(orgId, status);
    const priorities = prioritySlaRepository.findAll(orgId).map((p) => p.Priority);
    const classifications = picklistRepository.findAll(orgId, "CLASSIFICATION").map((c) => c.Value);
    const categoriesByClassification = Object.fromEntries(
        classifications.map((c) => [c, picklistRepository.findAll(orgId, "CATEGORY", c).map((x) => x.Value)])
    );
    const allowedStatuses = Object.keys(STATUS_WEIGHTS).filter((s) => statuses.includes(s));
    const allowedPriorities = Object.keys(PRIORITY_WEIGHTS).filter((p) => priorities.includes(p));
    if (banks.length === 0 || allowedStatuses.length === 0) {
        throw new Error("Need banks with team members and the seeded statuses - run `npm run seed` first");
    }

    const tickets = db.prepare(`SELECT * FROM ${DB_TABLES.TICKET} WHERE Org_Id = ? AND Is_Deleted = 'N'`).all(orgId);
    const now = Date.now();
    const counts = {};

    const run = db.transaction(() => {
        for (const original of tickets) {
            resetTicketActivity(db, original.Ticket_Id);

            const bank = pick(banks);
            const assigneeId = pick(agentsByTeam.get(bank.Department_Id));
            const priority = weighted(PRIORITY_WEIGHTS, allowedPriorities);
            const classification = classifications.length ? pick(classifications) : null;
            const category = classification && categoriesByClassification[classification].length ? pick(categoriesByClassification[classification]) : null;
            const target = weighted(STATUS_WEIGHTS, allowedStatuses);
            counts[target] = (counts[target] || 0) + 1;

            const created = new Date(now - between(60, DEMO_WINDOW_DAYS * 24 * 60));
            const path = buildPath(target, behaviourOf);

            // Step times: triage, then alternating work / waiting stretches.
            // Squeezed proportionally if the ticket is too recent to fit.
            const gaps = [between(10, 180)];
            for (let i = 1; i < path.length; i += 1) {
                gaps.push(behaviourOf(path[i - 1]) === CLOCK_BEHAVIOUR.PAUSED ? between(60, 2880) : between(30, 720));
            }
            const available = now - created.getTime() - MINUTE;
            const total = gaps.reduce((a, b) => a + b, 0);
            const scale = total > available ? available / total : 1;

            // Reset the row to a fresh, triaged ticket, then walk the path.
            let ticket = {
                ...original,
                Status: "Unassigned",
                Clock_State: CLOCK_BEHAVIOUR.NOT_STARTED,
                Resolution_Started_Time: null,
                Resolved_Time: null,
                Closed_Time: null
            };
            const triagedAt = new Date(created.getTime() + gaps[0] * scale);
            const dueDate = computeSlaDueDate({ createdTime: created, priority, bankId: bank.Bank_Id, orgId });
            ticketRepository.updateById(original.Ticket_Id, {
                Created_Time: created.toISOString(),
                Status: ticket.Status,
                Clock_State: ticket.Clock_State,
                Resolution_Started_Time: null,
                Resolved_Time: null,
                Closed_Time: null,
                Bank_Id: bank.Bank_Id,
                Department_Id: bank.Department_Id,
                Assignee_Id: assigneeId,
                Priority: priority,
                Classification: classification,
                Category: category,
                Response_Due_Date: dueDate,
                Modified_By: assigneeId
            });
            escalationService.rebuildTriggers({ Ticket_Id: original.Ticket_Id, Priority: priority, Bank_Id: bank.Bank_Id, Response_Due_Date: dueDate }, orgId);
            db.prepare(`UPDATE ${DB_TABLES.TICKET_HISTORY} SET Event_Time = ? WHERE Ticket_Id = ? AND Event_Name = ?`)
                .run(created.toISOString(), original.Ticket_Id, TICKET_HISTORY_EVENT.CREATED);
            logHistory({ ticketId: original.Ticket_Id, eventName: TICKET_HISTORY_EVENT.PRIORITY_CHANGE, fieldName: "Priority", oldValue: null, newValue: priority, actorAgentId: assigneeId, at: triagedAt, orgId });
            logHistory({ ticketId: original.Ticket_Id, eventName: TICKET_HISTORY_EVENT.REASSIGNED, fieldName: "Assignee_Id", oldValue: null, newValue: assigneeId, actorAgentId: assigneeId, at: triagedAt, orgId });

            let at = triagedAt.getTime();
            for (let i = 0; i < path.length; i += 1) {
                if (i > 0) at += gaps[i] * scale;
                const when = new Date(at);
                const changes = resolutionClock.applyStatusChange({
                    ticket, newStatus: path[i], bankId: bank.Bank_Id, actorAgentId: assigneeId, orgId, now: when
                });
                logHistory({ ticketId: original.Ticket_Id, eventName: TICKET_HISTORY_EVENT.STATUS_CHANGE, fieldName: "Status", oldValue: ticket.Status, newValue: path[i], actorAgentId: assigneeId, at: when, orgId });
                ticket = { ...ticket, ...changes, Status: path[i] };
                ticketRepository.updateById(original.Ticket_Id, { ...changes, Status: path[i], Modified_By: assigneeId });
            }

            // Stored total for tickets still running reflects "now".
            const metrics = metricsRepository.findMetricsByTicketId(original.Ticket_Id);
            if (metrics && ticket.Clock_State === CLOCK_BEHAVIOUR.RUNNING) {
                metricsRepository.updateById(metrics.Metric_Id, {
                    Resolution_Time_Mins: resolutionClock.computeResolutionMinutes(original.Ticket_Id, getCalendar(bank), new Date())
                });
            }
        }
    });
    run();

    logger.info(`Demo data: ${tickets.length} ticket(s) rewritten across ${banks.length} bank(s). Status mix: ${JSON.stringify(counts)}`);
};

if (require.main === module) {
    try {
        seedDemoTickets();
        closeDB();
        process.exit(0);
    } catch (error) {
        logger.error("Demo seed failed:", error);
        closeDB();
        process.exit(1);
    }
}

module.exports = { seedDemoTickets };
