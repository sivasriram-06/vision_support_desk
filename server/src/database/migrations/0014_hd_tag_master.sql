-- HD_TAG_MASTER: org-level tag vocabulary usable across modules
CREATE TABLE IF NOT EXISTS HD_TAG_MASTER (
    Tag_Id          TEXT PRIMARY KEY,
    Tag_Name        TEXT NOT NULL,
    Module          TEXT CHECK (Module IN ('Tickets', 'Contacts', 'Accounts', 'All')),
    Tag_Type        TEXT NOT NULL DEFAULT 'Manual' CHECK (Tag_Type IN ('Manual', 'Automatic', 'System')),
    Ticket_Count    INTEGER NOT NULL DEFAULT 0,
    Created_By      TEXT,
    Created_Time    TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By     TEXT,
    Modified_Time   TEXT,
    Is_Deleted       TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id          TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tag_name_org ON HD_TAG_MASTER (Org_Id, Tag_Name) WHERE Is_Deleted = 'N';
