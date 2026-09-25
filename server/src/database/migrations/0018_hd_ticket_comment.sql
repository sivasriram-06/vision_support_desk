-- HD_TICKET_COMMENT: internal-only notes on a ticket, not visible to the customer
CREATE TABLE IF NOT EXISTS HD_TICKET_COMMENT (
    Comment_Id            TEXT PRIMARY KEY,
    Ticket_Id             TEXT NOT NULL REFERENCES HD_TICKET_MASTER (Ticket_Id),
    Commenter_Agent_Id    TEXT NOT NULL REFERENCES HD_AGENT_MASTER (Agent_Id),
    Content               TEXT NOT NULL,
    -- Optional: the assignment (one person's work, HD_TICKET_ASSIGNMENT)
    -- the comment is about. Plain TEXT because that table is created later.
    Assignment_Id         TEXT,
    Commented_Time        TEXT NOT NULL,
    Created_By            TEXT NOT NULL,
    Created_Time          TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By           TEXT,
    Modified_Time         TEXT,
    Is_Deleted             TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_comment_ticket ON HD_TICKET_COMMENT (Ticket_Id);
