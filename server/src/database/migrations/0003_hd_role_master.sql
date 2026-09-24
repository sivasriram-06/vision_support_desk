-- HD_ROLE_MASTER: agent roles and the permissions each one grants.
-- Role_Key is the stable code the app reasons about (ADMIN / MANAGER /
-- TEAM_LEAD / ASSISTANT_TEAM_LEAD / TEAM_MEMBER - see
-- constants/permissions.js); Role_Name is the editable display name.
-- Permissions_Json is the admin-managed permission key list for the role.
CREATE TABLE IF NOT EXISTS HD_ROLE_MASTER (
    Role_Id             TEXT PRIMARY KEY,
    Role_Name           TEXT NOT NULL,
    Role_Key            TEXT NOT NULL,
    Parent_Role_Id      TEXT REFERENCES HD_ROLE_MASTER (Role_Id),
    Permissions_Json    TEXT,
    Sort_Order          INTEGER,
    Data_Sharing_Rule   TEXT,
    Created_By          TEXT,
    Created_Time        TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By         TEXT,
    Modified_Time       TEXT,
    Is_Deleted          TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id              TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_role_org ON HD_ROLE_MASTER (Org_Id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_key_org ON HD_ROLE_MASTER (Org_Id, Role_Key) WHERE Is_Deleted = 'N';
