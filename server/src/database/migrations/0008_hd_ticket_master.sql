-- HD_TICKET_MASTER: core ticket record.
-- Bank_Id is the client bank the ticket belongs to (HD_BANK_MASTER).
-- Priority is free text from the admin-managed HD_PRIORITY_SLA_CONFIG list.
-- Response_Due_Date is the SLA due date (priority SLA hours on the bank's
-- working-day calendar, fixed - never paused). Clock_State mirrors the
-- current Status's clock behaviour; Resolution_Started_Time / Resolved_Time
-- bound the resolution clock (segments in HD_TICKET_CLOCK_SEGMENT).
-- Who works the ticket is not a column here: a ticket can have several
-- equal assignees, including cross-team (product team) members, kept with
-- their history in HD_TICKET_ASSIGNMENT.
-- Sla_Start_Time is what the SLA due date counts from: Created_Time, reset
-- to the reopen time when a closed ticket is reopened (HD_TICKET_REOPEN).
-- Split_From_Ticket_Id links a ticket created from a customer's reply on a
-- closed ticket ("Create as new issue") back to that ticket.
-- Product_Id is plain TEXT: HD_PRODUCT_MASTER is created later in the
-- migration order.
CREATE TABLE IF NOT EXISTS HD_TICKET_MASTER (
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
    Department_Id              TEXT NOT NULL REFERENCES HD_DEPARTMENT_MASTER (Department_Id),
    Bank_Id                    TEXT REFERENCES HD_BANK_MASTER (Bank_Id),
    Contact_Id                 TEXT NOT NULL REFERENCES HD_CONTACT_MASTER (Contact_Id),
    Product_Id                 TEXT,
    Split_From_Ticket_Id       TEXT REFERENCES HD_TICKET_MASTER (Ticket_Id),
    Sla_Start_Time             TEXT,
    Response_Due_Date            TEXT,
    Closed_Time                 TEXT,
    Clock_State                 TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (Clock_State IN ('NOT_STARTED', 'RUNNING', 'PAUSED', 'STOPPED')),
    Resolution_Started_Time     TEXT,
    Resolved_Time               TEXT,
    Thread_Count                INTEGER NOT NULL DEFAULT 0,
    Comment_Count               INTEGER NOT NULL DEFAULT 0,
    Attachment_Count            INTEGER NOT NULL DEFAULT 0,
    Created_By                  TEXT NOT NULL,
    Created_Time                TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By                 TEXT,
    Modified_Time                TEXT,
    Is_Deleted                  TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                     TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_number_org ON HD_TICKET_MASTER (Org_Id, Ticket_Number);
CREATE INDEX IF NOT EXISTS idx_ticket_department ON HD_TICKET_MASTER (Department_Id);
CREATE INDEX IF NOT EXISTS idx_ticket_bank ON HD_TICKET_MASTER (Bank_Id);
CREATE INDEX IF NOT EXISTS idx_ticket_contact ON HD_TICKET_MASTER (Contact_Id);
CREATE INDEX IF NOT EXISTS idx_ticket_status_type ON HD_TICKET_MASTER (Status_Type);
CREATE INDEX IF NOT EXISTS idx_ticket_org ON HD_TICKET_MASTER (Org_Id);
CREATE INDEX IF NOT EXISTS idx_ticket_created_time ON HD_TICKET_MASTER (Created_Time);
