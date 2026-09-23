-- HD_STATUS_MASTER: admin-managed list of ticket Status labels (e.g. "In
-- Progress - Client", "On Hold - Dependent", "Resolved"), each mapped to the
-- fixed Status_Type bucket (Open/On Hold/Closed) that drives SLA/closed-time
-- logic. Mirrors HD_PRIORITY_SLA_CONFIG's admin-list pattern. Status itself
-- has been free TEXT on HD_TICKET_MASTER since 0015 (no CHECK constraint),
-- so no ticket-table migration is needed here.
CREATE TABLE IF NOT EXISTS HD_STATUS_MASTER (
    Status_Config_Id  TEXT PRIMARY KEY,
    Status_Label      TEXT NOT NULL,
    Status_Type       TEXT NOT NULL CHECK (Status_Type IN ('Open', 'On Hold', 'Closed')),
    Created_By        TEXT,
    Created_Time      TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By       TEXT,
    Modified_Time     TEXT,
    Is_Deleted         TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id            TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_status_label_org ON HD_STATUS_MASTER (Org_Id, Status_Label) WHERE Is_Deleted = 'N';
CREATE INDEX IF NOT EXISTS idx_status_org ON HD_STATUS_MASTER (Org_Id);
