-- HD_ESCALATION_LEVEL: admin-managed escalation matrix (Config page). For
-- each priority, level N is reached Offset_Hours from the ticket's SLA due
-- date (Response_Due_Date): negative = before due ("nearing"), 0 = at due,
-- positive = after due. Hours are counted on the bank's SLA working-day
-- calendar. Offsets must increase with Level_No within a priority, so a
-- higher level is always reached later. Any number of levels.
CREATE TABLE IF NOT EXISTS HD_ESCALATION_LEVEL (
    Escalation_Level_Id  TEXT PRIMARY KEY,
    Priority             TEXT NOT NULL,
    Level_No             INTEGER NOT NULL CHECK (Level_No >= 1),
    Offset_Hours         REAL NOT NULL,
    Created_By           TEXT,
    Created_Time         TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By          TEXT,
    Modified_Time        TEXT,
    Is_Deleted           TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id               TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_escalation_level ON HD_ESCALATION_LEVEL (Org_Id, Priority, Level_No) WHERE Is_Deleted = 'N';
