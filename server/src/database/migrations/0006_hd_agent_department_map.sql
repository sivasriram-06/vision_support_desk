-- HD_AGENT_DEPARTMENT_MAP: many-to-many agent <-> department membership
CREATE TABLE IF NOT EXISTS HD_AGENT_DEPARTMENT_MAP (
    Agent_Department_Map_Id  TEXT PRIMARY KEY,
    Agent_Id                 TEXT NOT NULL REFERENCES HD_AGENT_MASTER (Agent_Id),
    Department_Id            TEXT NOT NULL REFERENCES HD_DEPARTMENT_MASTER (Department_Id),
    Created_By               TEXT,
    Created_Time             TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By              TEXT,
    Modified_Time            TEXT,
    Is_Deleted                TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                   TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_department ON HD_AGENT_DEPARTMENT_MAP (Agent_Id, Department_Id);
