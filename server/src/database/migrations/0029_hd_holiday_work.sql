-- HD_HOLIDAY_WORK: an agent worked a ticket on a company holiday. The
-- holiday is skipped by resolution time, so a running "holiday timer"
-- stretch [Started_Time, Ended_Time) is added back to that ticket's
-- resolution time (never to the SLA). Ended_Time NULL = timer running; it is
-- closed at midnight IST if the agent doesn't stop it.
CREATE TABLE IF NOT EXISTS HD_HOLIDAY_WORK (
    Holiday_Work_Id TEXT PRIMARY KEY,
    Ticket_Id       TEXT NOT NULL REFERENCES HD_TICKET_MASTER (Ticket_Id),
    Agent_Id        TEXT NOT NULL REFERENCES HD_AGENT_MASTER (Agent_Id),
    Holiday_Date    TEXT NOT NULL,
    Started_Time    TEXT NOT NULL,
    Ended_Time      TEXT,
    Minutes         INTEGER,
    Created_By      TEXT,
    Created_Time    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+05:30', 'now', '+330 minutes')),
    Modified_By     TEXT,
    Modified_Time   TEXT,
    Is_Deleted      TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id          TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_holiday_work_ticket ON HD_HOLIDAY_WORK (Ticket_Id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_holiday_work_open ON HD_HOLIDAY_WORK (Ticket_Id, Agent_Id) WHERE Ended_Time IS NULL AND Is_Deleted = 'N';
