-- HD_CONTACT_MASTER: customers - every From address the Gmail sync has
-- seen (bank side and our own agents alike). Bank_Id starts empty; a lead
-- sets it from the Customers page.
CREATE TABLE IF NOT EXISTS HD_CONTACT_MASTER (
    Contact_Id              TEXT PRIMARY KEY,
    First_Name              TEXT,
    Last_Name               TEXT NOT NULL,
    Email                   TEXT,
    Bank_Id                 TEXT REFERENCES HD_BANK_MASTER (Bank_Id),
    Created_By              TEXT,
    Created_Time            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+05:30', 'now', '+330 minutes')),
    Modified_By             TEXT,
    Modified_Time           TEXT,
    Is_Deleted              TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                  TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_email_org ON HD_CONTACT_MASTER (Org_Id, Email COLLATE NOCASE) WHERE Is_Deleted = 'N' AND Email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_bank ON HD_CONTACT_MASTER (Bank_Id);
CREATE INDEX IF NOT EXISTS idx_contact_org ON HD_CONTACT_MASTER (Org_Id);
