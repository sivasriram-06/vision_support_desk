-- HD_TICKET_REOPEN: one row per time a Closed ticket was reopened by a lead
-- (Reopen #1, #2 ...). Reopen_Count on HD_TICKET_METRICS counts these rows.
-- Prev_* capture the round that just ended (when it closed, its SLA due
-- date and whether that SLA was met); Closed_Again_Time is filled when the
-- reopened round closes. Trigger_Conversation_Id is the customer mail that
-- led to the reopen - NULL for a manual reopen (e.g. the customer called).
CREATE TABLE IF NOT EXISTS HD_TICKET_REOPEN (
    Reopen_Id               TEXT PRIMARY KEY,
    Ticket_Id               TEXT NOT NULL REFERENCES HD_TICKET_MASTER (Ticket_Id),
    Reopen_No               INTEGER NOT NULL,
    Reason                  TEXT NOT NULL,
    Trigger_Conversation_Id TEXT REFERENCES HD_TICKET_CONVERSATION (Conversation_Id),
    Reopened_By             TEXT NOT NULL REFERENCES HD_AGENT_MASTER (Agent_Id),
    Reopened_Time           TEXT NOT NULL,
    Prev_Closed_Time        TEXT,
    Prev_Due_Date           TEXT,
    Prev_Sla_Met            TEXT CHECK (Prev_Sla_Met IN ('Y', 'N')),
    Closed_Again_Time       TEXT,
    Org_Id                  TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_reopen_no ON HD_TICKET_REOPEN (Ticket_Id, Reopen_No);
