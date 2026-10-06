const { EventEmitter } = require("events");
const { nowIst } = require("../utils/time");

// In-process bus: events say only WHAT changed (never data) so browsers refetch via REST and permissions hold.
const bus = new EventEmitter();
bus.setMaxListeners(20);

const REALTIME_EVENT = {
    TICKET_CREATED: "ticket.created",
    TICKET_CHANGED: "ticket.changed",
    TICKET_DELETED: "ticket.deleted",
    TICKET_CONVERSATION: "ticket.conversation",
    TICKET_ASSIGNMENT: "ticket.assignment",
    TICKET_REOPEN: "ticket.reopen",
    MY_TICKETS_CHANGED: "my-tickets.changed",
    ESCALATION_CHANGED: "escalation.changed",
    CUSTOMER_CHANGED: "customer.changed",
    // Hub-only: closes the target agents' sockets (deactivated, revoked, password reset); never sent to browsers.
    SESSION_REVOKED: "session.revoked"
};

// `toAgents` limits delivery to those agent ids; omitted = every signed-in agent.
const publish = (event, { toAgents = null } = {}) => {
    const targets = toAgents ? [...new Set(toAgents.filter(Boolean))] : null;
    // Deliver after the caller's DB transaction finishes so a triggered refetch sees the commit.
    setImmediate(() => bus.emit("event", { ...event, at: nowIst() }, targets));
};

module.exports = { bus, publish, REALTIME_EVENT };
