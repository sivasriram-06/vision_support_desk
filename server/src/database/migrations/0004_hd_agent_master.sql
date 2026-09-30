-- HD_AGENT_MASTER: support agent record. No password column - sign-in
-- credentials live in HD_AGENT_CREDENTIAL.
CREATE TABLE IF NOT EXISTS HD_AGENT_MASTER (
    Agent_Id                 TEXT PRIMARY KEY,
    First_Name               TEXT NOT NULL,
    Last_Name                TEXT NOT NULL,
    Email                    TEXT NOT NULL,
    Status                   TEXT NOT NULL DEFAULT 'Active' CHECK (Status IN ('Active', 'Inactive')),
    Role_Id                  TEXT REFERENCES HD_ROLE_MASTER (Role_Id),
    Primary_Department_Id    TEXT REFERENCES HD_DEPARTMENT_MASTER (Department_Id),
    Created_By               TEXT,
    Created_Time             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+05:30', 'now', '+330 minutes')),
    Modified_By              TEXT,
    Modified_Time            TEXT,
    Is_Deleted               TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                   TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_email_org ON HD_AGENT_MASTER (Org_Id, Email) WHERE Is_Deleted = 'N';
CREATE INDEX IF NOT EXISTS idx_agent_org ON HD_AGENT_MASTER (Org_Id);
CREATE INDEX IF NOT EXISTS idx_agent_department ON HD_AGENT_MASTER (Primary_Department_Id);
