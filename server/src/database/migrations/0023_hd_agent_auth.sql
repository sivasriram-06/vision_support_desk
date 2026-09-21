-- HD_AGENT_AUTH: external identity mapping for agent authentication.
-- No plaintext password is ever stored here or in HD_AGENT_MASTER.
CREATE TABLE IF NOT EXISTS HD_AGENT_AUTH (
    Agent_Auth_Id        TEXT PRIMARY KEY,
    Agent_Id             TEXT NOT NULL REFERENCES HD_AGENT_MASTER (Agent_Id),
    Identity_Provider    TEXT NOT NULL CHECK (Identity_Provider IN ('GOOGLE', 'OIDC', 'SAML')),
    External_Subject     TEXT NOT NULL,
    Login_Email          TEXT NOT NULL,
    Is_Active            TEXT NOT NULL DEFAULT 'Y' CHECK (Is_Active IN ('Y', 'N')),
    Last_Login_Time       TEXT,
    Created_Time         TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_Time         TEXT,
    Created_By           TEXT,
    Modified_By          TEXT,
    Is_Deleted            TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id               TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_auth_subject ON HD_AGENT_AUTH (Identity_Provider, External_Subject);
CREATE INDEX IF NOT EXISTS idx_agent_auth_agent ON HD_AGENT_AUTH (Agent_Id);
