-- HD_PROFILE_MASTER: agent permission profile
CREATE TABLE IF NOT EXISTS HD_PROFILE_MASTER (
    Profile_Id          TEXT PRIMARY KEY,
    Profile_Name        TEXT NOT NULL,
    Description          TEXT,
    Profile_Type        TEXT NOT NULL DEFAULT 'Custom' CHECK (Profile_Type IN ('Administrator', 'Agent', 'Custom')),
    Is_Default          TEXT NOT NULL DEFAULT 'N' CHECK (Is_Default IN ('Y', 'N')),
    Is_Visible          TEXT NOT NULL DEFAULT 'Y' CHECK (Is_Visible IN ('Y', 'N')),
    Permissions_Json     TEXT,
    Created_By          TEXT,
    Created_Time        TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By         TEXT,
    Modified_Time       TEXT,
    Is_Deleted          TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id              TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_profile_org ON HD_PROFILE_MASTER (Org_Id);
