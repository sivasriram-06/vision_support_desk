-- HD_DEPARTMENT_MASTER: support department / top-level queue
CREATE TABLE IF NOT EXISTS HD_DEPARTMENT_MASTER (
    Department_Id               TEXT PRIMARY KEY,
    Department_Name             TEXT NOT NULL,
    Sanitized_Name               TEXT,
    Description                 TEXT,
    Name_In_Customer_Portal     TEXT,
    Creator_Agent_Id            TEXT,
    Is_Default                  TEXT NOT NULL DEFAULT 'N' CHECK (Is_Default IN ('Y', 'N')),
    Is_Enabled                  TEXT NOT NULL DEFAULT 'Y' CHECK (Is_Enabled IN ('Y', 'N')),
    Is_Visible_To_Contacts      TEXT NOT NULL DEFAULT 'Y' CHECK (Is_Visible_To_Contacts IN ('Y', 'N')),
    Is_Team_Assignment_Enabled  TEXT NOT NULL DEFAULT 'N' CHECK (Is_Team_Assignment_Enabled IN ('Y', 'N')),
    Has_Logo                    TEXT NOT NULL DEFAULT 'N' CHECK (Has_Logo IN ('Y', 'N')),
    Chat_Status                 TEXT CHECK (Chat_Status IN ('Available', 'Away', 'Offline')),
    Created_By                  TEXT,
    Created_Time                TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By                 TEXT,
    Modified_Time               TEXT,
    Is_Deleted                  TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                      TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_department_org ON HD_DEPARTMENT_MASTER (Org_Id);
