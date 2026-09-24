-- HD_BANK_MASTER: a client bank and its support contract - which support
-- team (department) works it, module, support level, support days/hours
-- and 24x7 cover. Source: docs/Vision Support Desk KB.xlsx
-- ("Bank Wise Status" + "Support Hours" sheets).
CREATE TABLE IF NOT EXISTS HD_BANK_MASTER (
    Bank_Id              TEXT PRIMARY KEY,
    Bank_Name            TEXT NOT NULL,
    Department_Id        TEXT NOT NULL REFERENCES HD_DEPARTMENT_MASTER (Department_Id),
    Country              TEXT,
    Module               TEXT,
    Support_Level        TEXT CHECK (Support_Level IS NULL OR Support_Level IN ('Platinum', 'Gold', 'Silver')),
    Support_Days         TEXT,
    Support_Hours_Local  TEXT,
    Support_Hours_Ist    TEXT,
    Is_24x7              TEXT NOT NULL DEFAULT 'N' CHECK (Is_24x7 IN ('Y', 'N')),
    Remarks              TEXT,
    Created_By           TEXT,
    Created_Time         TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By          TEXT,
    Modified_Time        TEXT,
    Is_Deleted           TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id               TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_name_org ON HD_BANK_MASTER (Org_Id, Bank_Name COLLATE NOCASE) WHERE Is_Deleted = 'N';
CREATE INDEX IF NOT EXISTS idx_bank_department ON HD_BANK_MASTER (Department_Id);

-- HD_BANK_RESOURCE_MAP: who works a bank - its primary and secondary
-- resources. A bank may have more than one of each (e.g. I&M Kenya:
-- Sudharshan / Ezhil as primary).
CREATE TABLE IF NOT EXISTS HD_BANK_RESOURCE_MAP (
    Bank_Resource_Id    TEXT PRIMARY KEY,
    Bank_Id             TEXT NOT NULL REFERENCES HD_BANK_MASTER (Bank_Id),
    Agent_Id            TEXT NOT NULL REFERENCES HD_AGENT_MASTER (Agent_Id),
    Resource_Type       TEXT NOT NULL CHECK (Resource_Type IN ('PRIMARY', 'SECONDARY')),
    Created_By          TEXT,
    Created_Time        TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By         TEXT,
    Modified_Time       TEXT,
    Is_Deleted          TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id              TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_resource ON HD_BANK_RESOURCE_MAP (Bank_Id, Agent_Id, Resource_Type) WHERE Is_Deleted = 'N';
CREATE INDEX IF NOT EXISTS idx_bank_resource_agent ON HD_BANK_RESOURCE_MAP (Agent_Id);
