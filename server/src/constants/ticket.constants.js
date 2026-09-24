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
    CONVERSATION_ADDED: "CONVERSATION_ADDED",
    COMMENT_ADDED: "COMMENT_ADDED"
};

module.exports = {
    STATUS_TYPE,
    DEFAULT_STATUS_BY_TYPE,
    NEW_EMAIL_TICKET_STATUS,
    PRIORITY,
    CHANNEL,
    DIRECTION,
    TICKET_HISTORY_EVENT
};
