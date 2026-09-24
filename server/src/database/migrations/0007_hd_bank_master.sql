-- HD_TEAM_MASTER: team grouping below department level
CREATE TABLE IF NOT EXISTS HD_TEAM_MASTER (
    Team_Id          TEXT PRIMARY KEY,
    Team_Name        TEXT NOT NULL,
    Department_Id    TEXT NOT NULL REFERENCES HD_DEPARTMENT_MASTER (Department_Id),
    Logo_Path        TEXT,
    Created_By       TEXT,
    Created_Time     TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By      TEXT,
    Modified_Time    TEXT,
    Is_Deleted       TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id           TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_team_department ON HD_TEAM_MASTER (Department_Id);
