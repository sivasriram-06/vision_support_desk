-- HD_PRODUCT_MASTER: product catalog, linkable to tickets (HD_TICKET_MASTER.Product_Id).
-- Documented in docs/Zoho_Desk_Table_Config.xlsx but never implemented until now.
CREATE TABLE IF NOT EXISTS HD_PRODUCT_MASTER (
    Product_Id      TEXT PRIMARY KEY,
    Product_Name    TEXT NOT NULL,
    Description     TEXT,
    Department_Id   TEXT REFERENCES HD_DEPARTMENT_MASTER (Department_Id),
    Created_By      TEXT,
    Created_Time    TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By     TEXT,
    Modified_Time   TEXT,
    Is_Deleted       TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id          TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_name_org ON HD_PRODUCT_MASTER (Org_Id, Product_Name) WHERE Is_Deleted = 'N';
CREATE INDEX IF NOT EXISTS idx_product_org ON HD_PRODUCT_MASTER (Org_Id);
