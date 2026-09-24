-- HD_TICKET_CLOCK_SEGMENT: one row per stretch a ticket's resolution clock
-- was RUNNING (status with Clock_Behaviour = 'RUNNING', e.g. "In
-- Progress"). Ended_Time is NULL while the clock is still running.
-- Resolution time = working-day minutes summed over all segments, so
-- waiting on the bank (paused statuses) never counts. Kept per segment
-- rather than as one running total so it is auditable and recomputable
-- if a bank's calendar changes.
CREATE TABLE IF NOT EXISTS HD_TICKET_CLOCK_SEGMENT (
    Segment_Id          TEXT PRIMARY KEY,
    Ticket_Id           TEXT NOT NULL REFERENCES HD_TICKET_MASTER (Ticket_Id),
    Started_Time        TEXT NOT NULL,
    Ended_Time          TEXT,
    Status_At_Start     TEXT NOT NULL,
    Status_At_End       TEXT,
    Started_By          TEXT REFERENCES HD_AGENT_MASTER (Agent_Id),
    Ended_By            TEXT REFERENCES HD_AGENT_MASTER (Agent_Id),
    Created_By          TEXT NOT NULL,
    Created_Time        TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By         TEXT,
    Modified_Time       TEXT,
    Is_Deleted          TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id              TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_clock_segment_ticket ON HD_TICKET_CLOCK_SEGMENT (Ticket_Id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clock_segment_open ON HD_TICKET_CLOCK_SEGMENT (Ticket_Id) WHERE Ended_Time IS NULL AND Is_Deleted = 'N';
