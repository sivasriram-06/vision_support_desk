-- HD_TICKET_HISTORY: field-change audit trail / event log for a ticket
CREATE TABLE IF NOT EXISTS HD_TICKET_HISTORY (
    History_Id        TEXT PRIMARY KEY,
    Ticket_Id         TEXT NOT NULL REFERENCES HD_TICKET_MASTER (Ticket_Id),
    Event_Name        TEXT NOT NULL,
    Field_Name        TEXT,
    Old_Value         TEXT,
    New_Value         TEXT,
    Actor_Agent_Id    TEXT REFERENCES HD_AGENT_MASTER (Agent_Id),
    Event_Time        TEXT NOT NULL,
    Created_By        TEXT NOT NULL,
    Created_Time      TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By       TEXT,
    Modified_Time     TEXT,
    Is_Deleted         TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id            TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_history_ticket ON HD_TICKET_HISTORY (Ticket_Id);
CREATE INDEX IF NOT EXISTS idx_history_event_time ON HD_TICKET_HISTORY (Event_Time);
