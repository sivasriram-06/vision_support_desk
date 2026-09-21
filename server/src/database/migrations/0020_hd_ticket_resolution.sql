-- HD_TICKET_RESOLUTION: formal resolution note recorded against a ticket
CREATE TABLE IF NOT EXISTS HD_TICKET_RESOLUTION (
    Resolution_Id      TEXT PRIMARY KEY,
    Ticket_Id          TEXT NOT NULL REFERENCES HD_TICKET_MASTER (Ticket_Id),
    Author_Agent_Id    TEXT REFERENCES HD_AGENT_MASTER (Agent_Id),
    Content            TEXT NOT NULL,
    Created_By         TEXT NOT NULL,
    Created_Time       TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By        TEXT,
    Modified_Time      TEXT,
    Is_Deleted          TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id             TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_resolution_ticket ON HD_TICKET_RESOLUTION (Ticket_Id);
