-- HD_ACCOUNT_MASTER: customer company/organization record
CREATE TABLE IF NOT EXISTS HD_ACCOUNT_MASTER (
    Account_Id             TEXT PRIMARY KEY,
    Account_Name           TEXT NOT NULL,
    Email                  TEXT,
    Phone                  TEXT,
    Website                TEXT,
    Fax                    TEXT,
    Industry               TEXT,
    Annual_Revenue         REAL,
    Street                 TEXT,
    City                   TEXT,
    State                  TEXT,
    Zip_Code               TEXT,
    Country                TEXT,
    Description            TEXT,
    Owner_Agent_Id         TEXT REFERENCES HD_AGENT_MASTER (Agent_Id),
    External_Crm_Account_Id TEXT,
    Created_By             TEXT,
    Created_Time           TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By            TEXT,
    Modified_Time          TEXT,
    Is_Deleted              TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                 TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_account_org ON HD_ACCOUNT_MASTER (Org_Id);
