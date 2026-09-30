-- HD_ORGANIZATION_MASTER: tenant (single-tenant for this deployment)
CREATE TABLE IF NOT EXISTS HD_ORGANIZATION_MASTER (
    Organization_Id         TEXT PRIMARY KEY,
    Company_Name            TEXT NOT NULL,
    Created_By              TEXT,
    Created_Time            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+05:30', 'now', '+330 minutes')),
    Modified_By             TEXT,
    Modified_Time           TEXT,
    Is_Deleted              TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N'))
);
