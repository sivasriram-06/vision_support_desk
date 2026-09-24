-- HD_TICKET_CONVERSATION: unified message feed for a ticket.
-- Content_Html is the sanitized HTML body (see
-- src/utils/sanitize-email-html.js) alongside plain-text Content, so a
-- message renders as the sender formatted it; NULL when the source had no
-- HTML part. Renderers must still treat it as untrusted.
CREATE TABLE IF NOT EXISTS HD_TICKET_CONVERSATION (
    Conversation_Id      TEXT PRIMARY KEY,
    Ticket_Id            TEXT NOT NULL REFERENCES HD_TICKET_MASTER (Ticket_Id),
    Direction            TEXT CHECK (Direction IN ('in', 'out')),
    Channel              TEXT,
    Content              TEXT NOT NULL,
    Content_Html         TEXT,
    Author_Contact_Id    TEXT REFERENCES HD_CONTACT_MASTER (Contact_Id),
    Author_Agent_Id      TEXT REFERENCES HD_AGENT_MASTER (Agent_Id),
    Is_Public            TEXT NOT NULL DEFAULT 'Y' CHECK (Is_Public IN ('Y', 'N')),
    Is_Draft             TEXT NOT NULL DEFAULT 'N' CHECK (Is_Draft IN ('Y', 'N')),
    Is_Forward           TEXT NOT NULL DEFAULT 'N' CHECK (Is_Forward IN ('Y', 'N')),
    To_Address           TEXT,
    Cc_Address           TEXT,
    Sent_Time            TEXT NOT NULL,
    Created_By           TEXT NOT NULL,
    Created_Time         TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By          TEXT,
    Modified_Time        TEXT,
    Is_Deleted            TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id               TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_ticket ON HD_TICKET_CONVERSATION (Ticket_Id);
CREATE INDEX IF NOT EXISTS idx_conversation_sent_time ON HD_TICKET_CONVERSATION (Sent_Time);
