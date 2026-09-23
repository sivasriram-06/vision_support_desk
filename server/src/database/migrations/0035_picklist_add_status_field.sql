-- Adds STATUS to HD_PICKLIST_VALUE's allowed Field values, so Status can be
-- managed as a plain admin picklist (add/rename/delete) exactly like
-- Classification/Category - see 0033/0034 for the abandoned HD_STATUS_MASTER
-- "maps to Open/On Hold/Closed" approach this replaces. Nothing references
-- HD_PICKLIST_VALUE via FK, so this is a plain rebuild (no fk:off needed).
CREATE TABLE HD_PICKLIST_VALUE_NEW (
    Picklist_Value_Id   TEXT PRIMARY KEY,
    Field               TEXT NOT NULL CHECK (Field IN ('CLASSIFICATION', 'CATEGORY', 'SUB_CATEGORY', 'STATUS')),
    Value               TEXT NOT NULL,
    Sort_Order          INTEGER NOT NULL DEFAULT 0,
    Created_By          TEXT,
    Created_Time        TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By         TEXT,
    Modified_Time       TEXT,
    Is_Deleted           TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id              TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

INSERT INTO HD_PICKLIST_VALUE_NEW SELECT * FROM HD_PICKLIST_VALUE;

DROP TABLE HD_PICKLIST_VALUE;
ALTER TABLE HD_PICKLIST_VALUE_NEW RENAME TO HD_PICKLIST_VALUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_picklist_value_org ON HD_PICKLIST_VALUE (Org_Id, Field, Value) WHERE Is_Deleted = 'N';
CREATE INDEX IF NOT EXISTS idx_picklist_value_field ON HD_PICKLIST_VALUE (Org_Id, Field);
