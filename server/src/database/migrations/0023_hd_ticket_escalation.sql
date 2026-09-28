-- HD_TICKET_ESCALATION: when each escalation level falls due for a ticket
-- (Trigger_Time, ISO UTC) = its SLA due date + that level's Offset_Hours
-- on the bank's calendar. Rebuilt whenever the due date, bank or the
-- priority's escalation levels change (services/sla/escalation.service.js).
-- A ticket's current level is the highest Level_No whose Trigger_Time has
-- passed while its resolution clock is not STOPPED - computed at read
-- time, so no background job is needed.
CREATE TABLE IF NOT EXISTS HD_TICKET_ESCALATION (
    Ticket_Escalation_Id  TEXT PRIMARY KEY,
    Ticket_Id             TEXT NOT NULL REFERENCES HD_TICKET_MASTER (Ticket_Id),
    Level_No              INTEGER NOT NULL CHECK (Level_No >= 1),
    Trigger_Time          TEXT NOT NULL,
    Created_Time          TEXT NOT NULL DEFAULT (datetime('now')),
    Org_Id                TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_escalation ON HD_TICKET_ESCALATION (Ticket_Id, Level_No);
CREATE INDEX IF NOT EXISTS idx_ticket_escalation_trigger ON HD_TICKET_ESCALATION (Trigger_Time);
