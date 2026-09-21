-- HD_CONTACT_ACCOUNT_MAP: a contact can belong to several accounts
CREATE TABLE IF NOT EXISTS HD_CONTACT_ACCOUNT_MAP (
    Contact_Account_Id  TEXT PRIMARY KEY,
    Contact_Id          TEXT NOT NULL REFERENCES HD_CONTACT_MASTER (Contact_Id),
    Account_Id          TEXT NOT NULL REFERENCES HD_ACCOUNT_MASTER (Account_Id),
    Is_Primary          TEXT NOT NULL DEFAULT 'N' CHECK (Is_Primary IN ('Y', 'N')),
    Created_By          TEXT,
    Created_Time        TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By         TEXT,
    Modified_Time       TEXT,
    Is_Deleted           TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id               TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_account ON HD_CONTACT_ACCOUNT_MAP (Contact_Id, Account_Id);
