-- HD_APP_SETTING: admin-managed global switches, one row per key.
--   holidays.apply_to_24x7  'Y' | 'N'  - do company holidays also pause the
--                                      SLA / resolution time of Premium
--                                      (24x7) banks? Default 'N'.
CREATE TABLE IF NOT EXISTS HD_APP_SETTING (
    Setting_Key     TEXT NOT NULL,
    Setting_Value   TEXT,
    Modified_By     TEXT,
    Modified_Time   TEXT,
    Org_Id          TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id),
    PRIMARY KEY (Org_Id, Setting_Key)
);
