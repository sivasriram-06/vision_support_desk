-- HD_CHANNEL_MASTER: configured support channel
CREATE TABLE IF NOT EXISTS HD_CHANNEL_MASTER (
    Channel_Id         TEXT PRIMARY KEY,
    Channel_Name       TEXT NOT NULL,
    Channel_Type       TEXT NOT NULL CHECK (Channel_Type IN ('Email', 'Web Form', 'Social', 'Chat', 'Phone')),
    Department_Id      TEXT REFERENCES HD_DEPARTMENT_MASTER (Department_Id),
    Is_Reply_Enabled   TEXT NOT NULL DEFAULT 'Y' CHECK (Is_Reply_Enabled IN ('Y', 'N')),
    Is_Active          TEXT NOT NULL DEFAULT 'Y' CHECK (Is_Active IN ('Y', 'N')),
    Created_By         TEXT,
    Created_Time       TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By        TEXT,
    Modified_Time      TEXT,
    Is_Deleted         TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id             TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_channel_department ON HD_CHANNEL_MASTER (Department_Id);
