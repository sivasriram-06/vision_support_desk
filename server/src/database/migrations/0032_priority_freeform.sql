-- fk:off
-- Priorities become an admin-managed list (add/edit/delete), not a fixed
-- P1-P4 enum - so both places that CHECK-constrained Priority to those four
-- values need rebuilding (SQLite has no ALTER TABLE ... DROP CONSTRAINT).
-- HD_TICKET_MASTER is the parent of several FK relationships (history,
-- conversations, comments, attachments, metrics, resolution, tag map), so
-- the rebuild needs foreign_keys disabled - see migrate.js's "fk:off"
-- handling for why that can't just be a PRAGMA line in this file.
BEGIN TRANSACTION;

CREATE TABLE HD_TICKET_MASTER_NEW (
    Ticket_Id                  TEXT PRIMARY KEY,
    Ticket_Number              TEXT NOT NULL,
    Subject                    TEXT NOT NULL,
    Description                TEXT,
    Status                     TEXT NOT NULL,
    Status_Type                TEXT NOT NULL CHECK (Status_Type IN ('Open', 'On Hold', 'Closed')),
    Priority                   TEXT,
    Classification              TEXT,
    Category                   TEXT,
    Sub_Category                TEXT,
    Channel                    TEXT NOT NULL CHECK (Channel IN ('Email', 'Web Form', 'Social', 'Chat', 'Phone')),
    Channel_Code                TEXT,
    Language                   TEXT,
    Sentiment                  TEXT CHECK (Sentiment IN ('Positive', 'Negative', 'Neutral')),
    Relationship_Type           TEXT,
    Department_Id              TEXT NOT NULL REFERENCES HD_DEPARTMENT_MASTER (Department_Id),
    Team_Id                    TEXT REFERENCES HD_TEAM_MASTER (Team_Id),
    Contact_Id                 TEXT NOT NULL REFERENCES HD_CONTACT_MASTER (Contact_Id),
    Account_Id                 TEXT REFERENCES HD_ACCOUNT_MASTER (Account_Id),
    Assignee_Id                TEXT REFERENCES HD_AGENT_MASTER (Agent_Id),
    Product_Id                 TEXT,
    Contract_Id                 TEXT,
    Layout_Id                  TEXT,
    Sla_Policy_Id                TEXT,
    Blueprint_Id                TEXT,
    Due_Date                   TEXT,
    Response_Due_Date            TEXT,
    Closed_Time                 TEXT,
    Onhold_Time                 TEXT,
    Customer_Response_Time       TEXT,
    Resolution_Summary          TEXT,
    Is_OverDue                 TEXT NOT NULL DEFAULT 'N' CHECK (Is_OverDue IN ('Y', 'N')),
    Is_Response_Overdue          TEXT NOT NULL DEFAULT 'N' CHECK (Is_Response_Overdue IN ('Y', 'N')),
    Is_Escalated                TEXT NOT NULL DEFAULT 'N' CHECK (Is_Escalated IN ('Y', 'N')),
    Is_Archived                 TEXT NOT NULL DEFAULT 'N' CHECK (Is_Archived IN ('Y', 'N')),
    Is_Spam                    TEXT NOT NULL DEFAULT 'N' CHECK (Is_Spam IN ('Y', 'N')),
    Is_Trashed                  TEXT NOT NULL DEFAULT 'N' CHECK (Is_Trashed IN ('Y', 'N')),
    Thread_Count                INTEGER NOT NULL DEFAULT 0,
    Comment_Count               INTEGER NOT NULL DEFAULT 0,
    Follower_Count              INTEGER NOT NULL DEFAULT 0,
    Tag_Count                  INTEGER NOT NULL DEFAULT 0,
    Attachment_Count            INTEGER NOT NULL DEFAULT 0,
    Task_Count                  INTEGER NOT NULL DEFAULT 0,
    Time_Entry_Count             INTEGER NOT NULL DEFAULT 0,
    Approval_Count              INTEGER NOT NULL DEFAULT 0,
    Is_Read                    TEXT NOT NULL DEFAULT 'N' CHECK (Is_Read IN ('Y', 'N')),
    Is_Following                TEXT NOT NULL DEFAULT 'N' CHECK (Is_Following IN ('Y', 'N')),
    Has_Scheduled_Reply           TEXT NOT NULL DEFAULT 'N' CHECK (Has_Scheduled_Reply IN ('Y', 'N')),
    Created_By                  TEXT NOT NULL,
    Created_Time                TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By                 TEXT,
    Modified_Time                TEXT,
    Is_Deleted                  TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                     TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

INSERT INTO HD_TICKET_MASTER_NEW SELECT * FROM HD_TICKET_MASTER;

DROP TABLE HD_TICKET_MASTER;
ALTER TABLE HD_TICKET_MASTER_NEW RENAME TO HD_TICKET_MASTER;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_number_org ON HD_TICKET_MASTER (Org_Id, Ticket_Number);
CREATE INDEX IF NOT EXISTS idx_ticket_department ON HD_TICKET_MASTER (Department_Id);
CREATE INDEX IF NOT EXISTS idx_ticket_team ON HD_TICKET_MASTER (Team_Id);
CREATE INDEX IF NOT EXISTS idx_ticket_assignee ON HD_TICKET_MASTER (Assignee_Id);
CREATE INDEX IF NOT EXISTS idx_ticket_contact ON HD_TICKET_MASTER (Contact_Id);
CREATE INDEX IF NOT EXISTS idx_ticket_status_type ON HD_TICKET_MASTER (Status_Type);
CREATE INDEX IF NOT EXISTS idx_ticket_org ON HD_TICKET_MASTER (Org_Id);
CREATE INDEX IF NOT EXISTS idx_ticket_created_time ON HD_TICKET_MASTER (Created_Time);

-- HD_PRIORITY_SLA_CONFIG has no FK dependents, but rebuilding it here too
-- (same transaction) keeps both Priority CHECK removals in one migration.
CREATE TABLE HD_PRIORITY_SLA_CONFIG_NEW (
    Priority_Sla_Config_Id  TEXT PRIMARY KEY,
    Priority                TEXT NOT NULL,
    Sla_Hours               INTEGER NOT NULL CHECK (Sla_Hours > 0),
    Created_By              TEXT,
    Created_Time            TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By             TEXT,
    Modified_Time           TEXT,
    Is_Deleted               TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                  TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

INSERT INTO HD_PRIORITY_SLA_CONFIG_NEW SELECT * FROM HD_PRIORITY_SLA_CONFIG;

DROP TABLE HD_PRIORITY_SLA_CONFIG;
ALTER TABLE HD_PRIORITY_SLA_CONFIG_NEW RENAME TO HD_PRIORITY_SLA_CONFIG;

CREATE UNIQUE INDEX IF NOT EXISTS uq_priority_sla_org ON HD_PRIORITY_SLA_CONFIG (Org_Id, Priority) WHERE Is_Deleted = 'N';

COMMIT;
