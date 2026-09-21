-- HD_AUTH_LOGIN_EVENT: authentication audit trail for login, logout and
-- session security events. Never store secrets in Failure_Code.
CREATE TABLE IF NOT EXISTS HD_AUTH_LOGIN_EVENT (
    Login_Event_Id      TEXT PRIMARY KEY,
    Agent_Id            TEXT REFERENCES HD_AGENT_MASTER (Agent_Id),
    Event_Type          TEXT NOT NULL CHECK (Event_Type IN ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'SESSION_REVOKED')),
    Auth_Method         TEXT CHECK (Auth_Method IN ('GOOGLE', 'OIDC', 'SAML')),
    Identity_Provider    TEXT,
    Login_Email          TEXT,
    Failure_Code         TEXT,
    Event_Time          TEXT NOT NULL DEFAULT (datetime('now')),
    Ip_Address           TEXT,
    User_Agent          TEXT,
    Session_Id           TEXT REFERENCES HD_AGENT_SESSION (Session_Id),
    Org_Id               TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_login_event_agent ON HD_AUTH_LOGIN_EVENT (Agent_Id);
CREATE INDEX IF NOT EXISTS idx_login_event_time ON HD_AUTH_LOGIN_EVENT (Event_Time);
