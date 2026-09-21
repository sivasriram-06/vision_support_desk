-- HD_AGENT_MASTER: support agent record. No password/password hash column -
-- authentication identity lives in HD_AGENT_AUTH (see 0023).
CREATE TABLE IF NOT EXISTS HD_AGENT_MASTER (
    Agent_Id                 TEXT PRIMARY KEY,
    Zuid                     TEXT NOT NULL,
    First_Name               TEXT NOT NULL,
    Last_Name                TEXT NOT NULL,
    Email                    TEXT NOT NULL,
    Mobile                   TEXT,
    Phone                    TEXT,
    Extension                TEXT,
    Status                   TEXT NOT NULL DEFAULT 'Active' CHECK (Status IN ('Active', 'Inactive', 'Confirmed', 'Unconfirmed')),
    Role_Id                  TEXT REFERENCES HD_ROLE_MASTER (Role_Id),
    Profile_Id               TEXT REFERENCES HD_PROFILE_MASTER (Profile_Id),
    Role_Permission_Type     TEXT CHECK (Role_Permission_Type IN ('Standard', 'Custom')),
    Primary_Department_Id    TEXT REFERENCES HD_DEPARTMENT_MASTER (Department_Id),
    Timezone                 TEXT,
    Language                 TEXT,
    Country_Code             TEXT,
    Photo_Path               TEXT,
    About_Info               TEXT,
    Is_Confirmed             TEXT NOT NULL DEFAULT 'N' CHECK (Is_Confirmed IN ('Y', 'N')),
    Is_Zia_Agent              TEXT NOT NULL DEFAULT 'N' CHECK (Is_Zia_Agent IN ('Y', 'N')),
    Created_By               TEXT,
    Created_Time             TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By              TEXT,
    Modified_Time            TEXT,
    Is_Deleted               TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                   TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_email_org ON HD_AGENT_MASTER (Org_Id, Email) WHERE Is_Deleted = 'N';
CREATE INDEX IF NOT EXISTS idx_agent_org ON HD_AGENT_MASTER (Org_Id);
CREATE INDEX IF NOT EXISTS idx_agent_department ON HD_AGENT_MASTER (Primary_Department_Id);
