-- HD_TICKET_TAG_MAP: tags applied to a ticket (tag vocabulary lives once in
-- HD_TAG_MASTER, never duplicated per ticket)
CREATE TABLE IF NOT EXISTS HD_TICKET_TAG_MAP (
    Ticket_Tag_Map_Id   TEXT PRIMARY KEY,
    Ticket_Id           TEXT NOT NULL REFERENCES HD_TICKET_MASTER (Ticket_Id),
    Tag_Id              TEXT NOT NULL REFERENCES HD_TAG_MASTER (Tag_Id),
    Created_By          TEXT NOT NULL,
    Created_Time        TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By         TEXT,
    Modified_Time       TEXT,
    Is_Deleted            TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id              TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_tag ON HD_TICKET_TAG_MAP (Ticket_Id, Tag_Id);
