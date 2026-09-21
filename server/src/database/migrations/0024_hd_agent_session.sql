-- HD_AGENT_SESSION: authenticated server-side session state with expiry,
-- revocation and CSRF binding. The raw session/CSRF token is never
-- persisted, only its hash.
CREATE TABLE IF NOT EXISTS HD_AGENT_SESSION (
    Session_Id            TEXT PRIMARY KEY,
    Agent_Id              TEXT NOT NULL REFERENCES HD_AGENT_MASTER (Agent_Id),
    Session_Token_Hash     TEXT NOT NULL,
    Created_Time          TEXT NOT NULL DEFAULT (datetime('now')),
    Expires_Time           TEXT NOT NULL,
    Last_Activity_Time      TEXT,
    Revoked_Time           TEXT,
    Ip_Address             TEXT,
    User_Agent            TEXT,
    Csrf_Token_Hash        TEXT,
    Auth_Method           TEXT CHECK (Auth_Method IN ('GOOGLE', 'OIDC', 'SAML')),
    Is_Active             TEXT NOT NULL DEFAULT 'Y' CHECK (Is_Active IN ('Y', 'N')),
    Created_By            TEXT,
    Modified_Time          TEXT,
    Is_Deleted             TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_session_agent ON HD_AGENT_SESSION (Agent_Id);
CREATE INDEX IF NOT EXISTS idx_session_expires ON HD_AGENT_SESSION (Expires_Time);
