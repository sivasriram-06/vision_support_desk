-- HD_PICKLIST_VALUE: org-configurable option lists for ticket fields that
-- have no dedicated master table (Classification, Category, Sub Category).
-- Status_Type and Priority stay fixed system enums (wired into validation
-- and blueprint-style logic elsewhere), so they are intentionally not here.
CREATE TABLE IF NOT EXISTS HD_PICKLIST_VALUE (
    Picklist_Value_Id   TEXT PRIMARY KEY,
    Field               TEXT NOT NULL CHECK (Field IN ('CLASSIFICATION', 'CATEGORY', 'SUB_CATEGORY')),
    Value               TEXT NOT NULL,
    Sort_Order          INTEGER NOT NULL DEFAULT 0,
    Created_By          TEXT,
    Created_Time        TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By         TEXT,
    Modified_Time       TEXT,
    Is_Deleted           TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id              TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_picklist_value_org ON HD_PICKLIST_VALUE (Org_Id, Field, Value) WHERE Is_Deleted = 'N';
CREATE INDEX IF NOT EXISTS idx_picklist_value_field ON HD_PICKLIST_VALUE (Org_Id, Field);
