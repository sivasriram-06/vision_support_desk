-- Work tracking for each assignment (HD_TICKET_ASSIGNMENT = one person's
-- piece of work on a ticket). Feeds the ticket's Tracking tab: where the
-- ticket sat, who it waited on, and how much each person/team worked.

-- HD_ASSIGNMENT_STATE_LOG: one row per stretch an assignment spent in a
-- work state. Ended_Time is NULL for the current stretch; releasing the
-- assignee closes it.
CREATE TABLE IF NOT EXISTS HD_ASSIGNMENT_STATE_LOG (
    State_Log_Id     TEXT PRIMARY KEY,
    Assignment_Id    TEXT NOT NULL REFERENCES HD_TICKET_ASSIGNMENT (Assignment_Id),
    Ticket_Id        TEXT NOT NULL REFERENCES HD_TICKET_MASTER (Ticket_Id),
    Work_State       TEXT NOT NULL CHECK (Work_State IN ('PENDING', 'WAITING', 'READY', 'IN_PROGRESS', 'ON_HOLD', 'DONE')),
    Started_Time     TEXT NOT NULL,
    Ended_Time       TEXT,
    Actor_Agent_Id   TEXT REFERENCES HD_AGENT_MASTER (Agent_Id),
    Note             TEXT,
    Org_Id           TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_state_log_assignment ON HD_ASSIGNMENT_STATE_LOG (Assignment_Id);
CREATE INDEX IF NOT EXISTS idx_state_log_ticket ON HD_ASSIGNMENT_STATE_LOG (Ticket_Id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_state_log_open ON HD_ASSIGNMENT_STATE_LOG (Assignment_Id) WHERE Ended_Time IS NULL;

-- HD_ASSIGNMENT_DEPENDENCY: Assignment_Id's work waits for
-- Depends_On_Assignment_Id's work to be DONE (e.g. support waits for the
-- Java fix). Assignments without a dependency run in parallel.
CREATE TABLE IF NOT EXISTS HD_ASSIGNMENT_DEPENDENCY (
    Dependency_Id              TEXT PRIMARY KEY,
    Ticket_Id                  TEXT NOT NULL REFERENCES HD_TICKET_MASTER (Ticket_Id),
    Assignment_Id              TEXT NOT NULL REFERENCES HD_TICKET_ASSIGNMENT (Assignment_Id),
    Depends_On_Assignment_Id   TEXT NOT NULL REFERENCES HD_TICKET_ASSIGNMENT (Assignment_Id),
    Created_By                 TEXT REFERENCES HD_AGENT_MASTER (Agent_Id),
    Created_Time               TEXT NOT NULL,
    Org_Id                     TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id),
    CHECK (Assignment_Id <> Depends_On_Assignment_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_dependency ON HD_ASSIGNMENT_DEPENDENCY (Assignment_Id, Depends_On_Assignment_Id);
CREATE INDEX IF NOT EXISTS idx_dependency_blocker ON HD_ASSIGNMENT_DEPENDENCY (Depends_On_Assignment_Id);

-- HD_TICKET_WORKLOG: effort someone logged against their assignment.
CREATE TABLE IF NOT EXISTS HD_TICKET_WORKLOG (
    Worklog_Id       TEXT PRIMARY KEY,
    Ticket_Id        TEXT NOT NULL REFERENCES HD_TICKET_MASTER (Ticket_Id),
    Assignment_Id    TEXT NOT NULL REFERENCES HD_TICKET_ASSIGNMENT (Assignment_Id),
    Agent_Id         TEXT NOT NULL REFERENCES HD_AGENT_MASTER (Agent_Id),
    Minutes          INTEGER NOT NULL CHECK (Minutes > 0),
    Work_Date        TEXT NOT NULL,
    Note             TEXT,
    Logged_By        TEXT REFERENCES HD_AGENT_MASTER (Agent_Id),
    Logged_Time      TEXT NOT NULL,
    Is_Deleted       TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id           TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_worklog_ticket ON HD_TICKET_WORKLOG (Ticket_Id);
CREATE INDEX IF NOT EXISTS idx_worklog_assignment ON HD_TICKET_WORKLOG (Assignment_Id);
