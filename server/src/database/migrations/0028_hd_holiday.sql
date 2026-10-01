-- HD_HOLIDAY: company holidays - days our (India-based) support team is off,
-- entered by an Admin / Manager / Team Lead on the Config page. Each row is
-- one IST date (no yearly repeat - every year is entered on its own).
-- The SLA due date and resolution time skip these days like a weekend;
-- Premium (24x7) banks skip them only when HD_APP_SETTING
-- 'holidays.apply_to_24x7' is 'Y'.
CREATE TABLE IF NOT EXISTS HD_HOLIDAY (
    Holiday_Id      TEXT PRIMARY KEY,
    Holiday_Date    TEXT NOT NULL CHECK (Holiday_Date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    Holiday_Name    TEXT NOT NULL,
    Created_By      TEXT,
    Created_Time    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+05:30', 'now', '+330 minutes')),
    Modified_By     TEXT,
    Modified_Time   TEXT,
    Is_Deleted      TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id          TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_holiday_date_org ON HD_HOLIDAY (Org_Id, Holiday_Date) WHERE Is_Deleted = 'N';
