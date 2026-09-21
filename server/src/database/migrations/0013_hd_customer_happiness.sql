-- HD_CUSTOMER_HAPPINESS: happiness score breakdown per contact
CREATE TABLE IF NOT EXISTS HD_CUSTOMER_HAPPINESS (
    Happiness_Id            TEXT PRIMARY KEY,
    Contact_Id              TEXT NOT NULL REFERENCES HD_CONTACT_MASTER (Contact_Id),
    Bad_Percentage          REAL NOT NULL DEFAULT 0,
    Ok_Percentage           REAL NOT NULL DEFAULT 0,
    Good_Percentage         REAL NOT NULL DEFAULT 0,
    Last_Calculated_Time    TEXT,
    Created_By              TEXT,
    Created_Time            TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By             TEXT,
    Modified_Time           TEXT,
    Is_Deleted               TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                  TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_happiness_contact ON HD_CUSTOMER_HAPPINESS (Contact_Id);
