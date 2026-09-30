const { EventEmitter } = require("events");
const { nowIst } = require("../utils/time");

/**
 * In-process realtime bus. Services call publish() after a change commits;
 * the WebSocket hub (ws-hub.js) fans each event out to connected browsers.
 *
 * Events only say WHAT changed - { type, ticketId, reason } - never the
 * data itself: the browser refetches through the REST API, so permissions
 * stay enforced in one place and nothing sensitive rides the socket.
 *
 *   publish({ type: "ticket.changed", ticketId, reason: "status" })
 *   publish({ type: "my-tickets.changed", ticketId }, { toAgents: [id, ...] })
 *
 * Single process only (SQLite = one server); several servers would need a
 * shared pub/sub (e.g. Redis) behind this same publish().
 */
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
    // Hub-only: closes the target agents' sockets (deactivated, sign-in
    // revoked, password reset). Never sent to browsers.
    SESSION_REVOKED: "session.revoked"
};

/**
 * `toAgents`: only these agent ids receive it (e.g. My Tickets badge);
 * omitted = every signed-in agent (everyone can view tickets).
 */
const publish = (event, { toAgents = null } = {}) => {
    const targets = toAgents ? [...new Set(toAgents.filter(Boolean))] : null;
    // Deliver after the caller's synchronous work (and its DB transaction)
    // has finished, so a refetch triggered by the event sees the commit.
    setImmediate(() => bus.emit("event", { ...event, at: nowIst() }, targets));
};

module.exports = { bus, publish, REALTIME_EVENT };
