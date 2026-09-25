-- HD_TICKET_ASSIGNMENT: who works a ticket, and since when. A ticket can
-- have several equal assignees at once - support team members assigned by
-- their team lead, plus product team members (Java, Angular...) pulled in
-- by anyone on the ticket (Is_Cross_Team = 'Y'). A row with
-- Released_Time NULL is a current assignee; releasing keeps the row, so
-- the full who/when/by-whom history stays for ticket tracking.
-- Department_Id is the assignee's team at the time of assignment.
-- Seen_Time is set when the assignee first opens the ticket, so My
-- Tickets can flag new assignments.
-- Each assignment is that person's piece of work on the ticket.
-- Work_State is its current state (every stretch is logged in
-- HD_ASSIGNMENT_STATE_LOG): PENDING (assigned, not started - waiting for
-- handover), WAITING (blocked by another assignee's work, see
-- HD_ASSIGNMENT_DEPENDENCY), READY (unblocked, not started),
-- IN_PROGRESS, ON_HOLD (waiting on the bank / information), DONE.
-- Round_No counts the rounds a team has had on this ticket (Java, back to
-- support, Java again = Java round 2).
CREATE TABLE IF NOT EXISTS HD_TICKET_ASSIGNMENT (
    Assignment_Id    TEXT PRIMARY KEY,
    Ticket_Id        TEXT NOT NULL REFERENCES HD_TICKET_MASTER (Ticket_Id),
    Agent_Id         TEXT NOT NULL REFERENCES HD_AGENT_MASTER (Agent_Id),
    Department_Id    TEXT REFERENCES HD_DEPARTMENT_MASTER (Department_Id),
    Is_Cross_Team    TEXT NOT NULL DEFAULT 'N' CHECK (Is_Cross_Team IN ('Y', 'N')),
    Assigned_By      TEXT REFERENCES HD_AGENT_MASTER (Agent_Id),
    Assigned_Time    TEXT NOT NULL,
    Note             TEXT,
    Work_State       TEXT NOT NULL DEFAULT 'PENDING' CHECK (Work_State IN ('PENDING', 'WAITING', 'READY', 'IN_PROGRESS', 'ON_HOLD', 'DONE')),
    Round_No         INTEGER NOT NULL DEFAULT 1 CHECK (Round_No >= 1),
    Seen_Time        TEXT,
    Released_By      TEXT REFERENCES HD_AGENT_MASTER (Agent_Id),
    Released_Time    TEXT,
    Created_Time     TEXT NOT NULL DEFAULT (datetime('now')),
    Org_Id           TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_ticket ON HD_TICKET_ASSIGNMENT (Ticket_Id);
CREATE INDEX IF NOT EXISTS idx_assignment_agent ON HD_TICKET_ASSIGNMENT (Agent_Id, Released_Time);
CREATE INDEX IF NOT EXISTS idx_assignment_assigned_by ON HD_TICKET_ASSIGNMENT (Assigned_By, Released_Time);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_open ON HD_TICKET_ASSIGNMENT (Ticket_Id, Agent_Id) WHERE Released_Time IS NULL;
