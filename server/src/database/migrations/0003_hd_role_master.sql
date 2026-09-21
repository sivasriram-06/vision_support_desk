-- HD_ROLE_MASTER: agent role hierarchy and data-sharing rules
CREATE TABLE IF NOT EXISTS HD_ROLE_MASTER (
    Role_Id             TEXT PRIMARY KEY,
    Role_Name           TEXT NOT NULL,
    Parent_Role_Id      TEXT REFERENCES HD_ROLE_MASTER (Role_Id),
    Data_Sharing_Rule   TEXT,
    Created_By          TEXT,
    Created_Time        TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By         TEXT,
    Modified_Time       TEXT,
    Is_Deleted          TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id              TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_role_org ON HD_ROLE_MASTER (Org_Id);
