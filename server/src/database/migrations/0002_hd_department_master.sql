-- HD_DEPARTMENT_MASTER: support team / top-level queue
CREATE TABLE IF NOT EXISTS HD_DEPARTMENT_MASTER (
    Department_Id               TEXT PRIMARY KEY,
    Department_Name             TEXT NOT NULL,
    Sanitized_Name              TEXT,
    -- Kind of team, from the admin-managed TEAM_TYPE list on the Config
    -- page (e.g. Support, Product; more can be added). Support teams are
    -- assigned by their lead; any other type can be pulled in by anyone.
    Team_Type                   TEXT,
    Is_Default                  TEXT NOT NULL DEFAULT 'N' CHECK (Is_Default IN ('Y', 'N')),
    Created_By                  TEXT,
    Created_Time                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+05:30', 'now', '+330 minutes')),
    Modified_By                 TEXT,
    Modified_Time               TEXT,
    Is_Deleted                  TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                      TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_department_org ON HD_DEPARTMENT_MASTER (Org_Id);
