-- HD_PICKLIST_VALUE: admin-managed option lists for ticket fields with no
-- dedicated master table - Status, Classification, Category, Sub Category.
-- Category is a sub-classification: Parent_Value holds the owning
-- Classification's Value text (e.g. "Problem" -> Application / Process),
-- and the same Category text may repeat under different Classifications.
-- NULL for every non-Category row.
CREATE TABLE IF NOT EXISTS HD_PICKLIST_VALUE (
    Picklist_Value_Id   TEXT PRIMARY KEY,
    Field               TEXT NOT NULL CHECK (Field IN ('CLASSIFICATION', 'CATEGORY', 'SUB_CATEGORY', 'STATUS')),
    Value               TEXT NOT NULL,
    Parent_Value        TEXT,
    Sort_Order          INTEGER NOT NULL DEFAULT 0,
    Created_By          TEXT,
    Created_Time        TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By         TEXT,
    Modified_Time       TEXT,
    Is_Deleted          TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id              TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

-- COALESCE so two NULL parents (every non-Category row) still collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_picklist_value_org
    ON HD_PICKLIST_VALUE (Org_Id, Field, COALESCE(Parent_Value, ''), Value)
    WHERE Is_Deleted = 'N';
CREATE INDEX IF NOT EXISTS idx_picklist_value_field ON HD_PICKLIST_VALUE (Org_Id, Field);
CREATE INDEX IF NOT EXISTS idx_picklist_value_parent ON HD_PICKLIST_VALUE (Org_Id, Field, Parent_Value);
