/**
 * Enum values captured from docs/Zoho_Desk_Table_Config.xlsx (HD_TICKET_MASTER
 * and related sheets). Status itself is tenant-configurable free text;
 * Status_Type is the fixed system bucket every Status maps into.
 */
const STATUS_TYPE = {
    OPEN: "Open",
    ON_HOLD: "On Hold",
    CLOSED: "Closed"
};

// Status every ticket created from an incoming email starts in, until a
// team lead picks it up. Must exist in the STATUS picklist
// (seed-data/config.json).
const NEW_EMAIL_TICKET_STATUS = "Unassigned";

// What a ticket's resolution clock does while in a given Status (set per
// status on the Config page, HD_PICKLIST_VALUE.Clock_Behaviour). The SLA
// due date is not affected - it never pauses.
const CLOCK_BEHAVIOUR = {
    NOT_STARTED: "NOT_STARTED", // e.g. Unassigned, Open - work not begun
    RUNNING: "RUNNING",         // e.g. In Progress - our side working
    PAUSED: "PAUSED",           // e.g. On Hold - Client - waiting on the bank
    STOPPED: "STOPPED"          // e.g. Resolved, Closed
};

const DEFAULT_STATUS_BY_TYPE = {
    [STATUS_TYPE.OPEN]: "Open",
    [STATUS_TYPE.ON_HOLD]: "On Hold",
    [STATUS_TYPE.CLOSED]: "Closed"
};

const PRIORITY = {
    P1: "P1",
    P2: "P2",
    P3: "P3",
    P4: "P4"
};

const CHANNEL = {
    EMAIL: "Email",
    WEB_FORM: "Web Form",
    SOCIAL: "Social",
    CHAT: "Chat",
    PHONE: "Phone"
};

const DIRECTION = {
    IN: "in",
    OUT: "out"
};

const TICKET_HISTORY_EVENT = {
    CREATED: "CREATED",
    STATUS_CHANGE: "STATUS_CHANGE",
    PRIORITY_CHANGE: "PRIORITY_CHANGE",
    REASSIGNED: "REASSIGNED",
    // HD_TICKET_ASSIGNMENT changes; New_Value / Old_Value hold the agent id.
    ASSIGNEE_ADDED: "ASSIGNEE_ADDED",
    ASSIGNEE_REMOVED: "ASSIGNEE_REMOVED",
    // Assignment work tracking (Tracking tab). New_Value = work state /
    // blocker assignment id / minutes; Field_Name = the assignee's agent id.
    WORK_STATE_CHANGE: "WORK_STATE_CHANGE",
    WORK_UNBLOCKED: "WORK_UNBLOCKED",
    DEPENDENCY_ADDED: "DEPENDENCY_ADDED",
    DEPENDENCY_REMOVED: "DEPENDENCY_REMOVED",
    WORKLOG_ADDED: "WORKLOG_ADDED",
    CONVERSATION_ADDED: "CONVERSATION_ADDED",
    // Replies on a Closed ticket (ticket-reopen.service.js). REOPENED:
    // New_Value = reopen no. SPLIT_TO / SPLIT_FROM: New_Value = the other
    // ticket id. CLOSE_REPLY_DISMISSED: New_Value = replies cleared.
    REOPENED: "REOPENED",
    SPLIT_TO: "SPLIT_TO",
    SPLIT_FROM: "SPLIT_FROM",
    CLOSE_REPLY_DISMISSED: "CLOSE_REPLY_DISMISSED",
    COMMENT_ADDED: "COMMENT_ADDED"
};

// One assignee's work on a ticket (HD_TICKET_ASSIGNMENT.Work_State).
const WORK_STATE = {
    PENDING: "PENDING", // assigned, not started - waiting for handover
    WAITING: "WAITING", // blocked by another assignee's unfinished work
    READY: "READY", // unblocked, not started yet
    IN_PROGRESS: "IN_PROGRESS",
    ON_HOLD: "ON_HOLD", // waiting on the bank / information
    DONE: "DONE"
};

// HD_TICKET_CONVERSATION.Post_Close_Decision - a customer mail on a Closed ticket.
const POST_CLOSE_DECISION = {
    PENDING: "PENDING",
    REOPENED: "REOPENED",
    SPLIT: "SPLIT",
    DISMISSED: "DISMISSED"
};

module.exports = {
    WORK_STATE,
    POST_CLOSE_DECISION,
    STATUS_TYPE,
    DEFAULT_STATUS_BY_TYPE,
    NEW_EMAIL_TICKET_STATUS,
    CLOCK_BEHAVIOUR,
    PRIORITY,
    CHANNEL,
    DIRECTION,
    TICKET_HISTORY_EVENT
};
