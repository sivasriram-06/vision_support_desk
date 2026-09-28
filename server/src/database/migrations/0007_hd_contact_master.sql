-- HD_CONTACT_MASTER: customer/requester directory
CREATE TABLE IF NOT EXISTS HD_CONTACT_MASTER (
    Contact_Id              TEXT PRIMARY KEY,
    First_Name              TEXT,
    Last_Name               TEXT NOT NULL,
    Email                   TEXT,
    Secondary_Email          TEXT,
    Phone                   TEXT,
    Mobile                  TEXT,
    Title                   TEXT,
    Twitter                 TEXT,
    Facebook                TEXT,
    Street                  TEXT,
    City                    TEXT,
    State                   TEXT,
    Zip                     TEXT,
    Country                 TEXT,
    Description             TEXT,
    Language                TEXT,
    Contact_Type            TEXT,
    Account_Id              TEXT REFERENCES HD_ACCOUNT_MASTER (Account_Id),
    Owner_Agent_Id          TEXT REFERENCES HD_AGENT_MASTER (Agent_Id),
    Photo_Url               TEXT,
    Is_Anonymous            TEXT NOT NULL DEFAULT 'N' CHECK (Is_Anonymous IN ('Y', 'N')),
    Is_End_User             TEXT NOT NULL DEFAULT 'N' CHECK (Is_End_User IN ('Y', 'N')),
    Is_Spam                 TEXT NOT NULL DEFAULT 'N' CHECK (Is_Spam IN ('Y', 'N')),
    External_Crm_Contact_Id TEXT,
    Created_By              TEXT,
    Created_Time            TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By             TEXT,
    Modified_Time           TEXT,
    Is_Deleted               TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                  TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_email_org ON HD_CONTACT_MASTER (Org_Id, Email) WHERE Is_Deleted = 'N' AND Email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_account ON HD_CONTACT_MASTER (Account_Id);
CREATE INDEX IF NOT EXISTS idx_contact_org ON HD_CONTACT_MASTER (Org_Id);
