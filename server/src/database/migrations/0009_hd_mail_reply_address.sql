-- HD_MAIL_REPLY_ADDRESS: support email address(es) configured per department.
-- The Gmail ingestion engine looks up Department_Id from here by Email_Address
-- (e.g. tasks@sunoida.com) instead of hard-coding department context.
CREATE TABLE IF NOT EXISTS HD_MAIL_REPLY_ADDRESS (
    Mail_Reply_Address_Id  TEXT PRIMARY KEY,
    Department_Id          TEXT NOT NULL REFERENCES HD_DEPARTMENT_MASTER (Department_Id),
    Display_Name           TEXT,
    Email_Address           TEXT NOT NULL,
    Is_Verified             TEXT NOT NULL DEFAULT 'N' CHECK (Is_Verified IN ('Y', 'N')),
    Smtp_Config_Json        TEXT,
    Created_By              TEXT,
    Created_Time            TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By             TEXT,
    Modified_Time           TEXT,
    Is_Deleted               TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                  TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mail_reply_address ON HD_MAIL_REPLY_ADDRESS (Email_Address) WHERE Is_Deleted = 'N';
