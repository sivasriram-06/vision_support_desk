-- HD_PRIORITY_SLA_CONFIG: admin-managed priority list with an SLA target
-- (in hours) per priority. HD_TICKET_MASTER.Response_Due_Date is
-- recalculated from the ticket's Created_Time + Sla_Hours whenever its
-- Priority is set/changed (see ticket.service.js).
CREATE TABLE IF NOT EXISTS HD_PRIORITY_SLA_CONFIG (
    Priority_Sla_Config_Id  TEXT PRIMARY KEY,
    Priority                TEXT NOT NULL,
    Sla_Hours               INTEGER NOT NULL CHECK (Sla_Hours > 0),
    Created_By              TEXT,
    Created_Time            TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By             TEXT,
    Modified_Time           TEXT,
    Is_Deleted              TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                  TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_priority_sla_org ON HD_PRIORITY_SLA_CONFIG (Org_Id, Priority) WHERE Is_Deleted = 'N';
