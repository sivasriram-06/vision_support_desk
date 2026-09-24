-- HD_AGENT_CREDENTIAL: local (email + password) sign-in credential for an
-- agent. Kept apart from HD_AGENT_AUTH (external IdP subjects). Only a
-- bcrypt hash is stored. Must_Change_Password = 'Y' for temporary
-- passwords (seed default / admin reset) - every other route is refused
-- until the agent chooses their own.
CREATE TABLE IF NOT EXISTS HD_AGENT_CREDENTIAL (
    Agent_Credential_Id     TEXT PRIMARY KEY,
    Agent_Id                TEXT NOT NULL REFERENCES HD_AGENT_MASTER (Agent_Id),
    Password_Hash           TEXT NOT NULL,
    Must_Change_Password    TEXT NOT NULL DEFAULT 'Y' CHECK (Must_Change_Password IN ('Y', 'N')),
    Password_Changed_Time   TEXT,
    Failed_Login_Count      INTEGER NOT NULL DEFAULT 0,
    Locked_Until            TEXT,
    Last_Login_Time         TEXT,
    Created_By              TEXT,
    Created_Time            TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By             TEXT,
    Modified_Time           TEXT,
    Is_Deleted              TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                  TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_credential_agent ON HD_AGENT_CREDENTIAL (Agent_Id) WHERE Is_Deleted = 'N';
