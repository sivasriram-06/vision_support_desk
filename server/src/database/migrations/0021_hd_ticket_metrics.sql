-- HD_TICKET_METRICS: SLA and handling metrics for a ticket
CREATE TABLE IF NOT EXISTS HD_TICKET_METRICS (
    Metric_Id                   TEXT PRIMARY KEY,
    Ticket_Id                   TEXT NOT NULL REFERENCES HD_TICKET_MASTER (Ticket_Id),
    First_Response_Time_Mins     INTEGER,
    Total_Response_Time_Mins     INTEGER,
    Resolution_Time_Mins         INTEGER,
    Reopen_Count                INTEGER NOT NULL DEFAULT 0,
    Reassign_Count               INTEGER NOT NULL DEFAULT 0,
    Response_Count              INTEGER NOT NULL DEFAULT 0,
    Handled_By_Agent_Ids          TEXT,
    Created_By                  TEXT NOT NULL,
    Created_Time                TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By                 TEXT,
    Modified_Time                TEXT,
    Is_Deleted                   TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                      TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_metrics_ticket ON HD_TICKET_METRICS (Ticket_Id);
