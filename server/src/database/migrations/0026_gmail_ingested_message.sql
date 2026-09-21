-- _GMAIL_INGESTED_MESSAGE: internal ingestion cursor, not part of the HD_*
-- captured schema. Tracks the raw Gmail API message id (free from
-- messages.list, no quota cost) so the sync job can skip a message it has
-- already processed WITHOUT paying for a messages.get(format=full) call
-- just to read its RFC Message-ID header. This is what keeps repeated
-- ticks cheap on Gmail API quota.
CREATE TABLE IF NOT EXISTS _GMAIL_INGESTED_MESSAGE (
    Gmail_Message_Id  TEXT PRIMARY KEY,
    Ticket_Id         TEXT NOT NULL REFERENCES HD_TICKET_MASTER (Ticket_Id),
    Thread_Id         TEXT REFERENCES HD_TICKET_THREAD (Thread_Id),
    Created_Time      TEXT NOT NULL DEFAULT (datetime('now'))
);
