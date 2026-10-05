-- _GMAIL_PURGED_MESSAGE: Gmail message ids whose ticket was permanently
-- deleted from the recycle bin (recycle-bin.service.js). The purge removes
-- the ticket's _GMAIL_INGESTED_MESSAGE rows with it, but the mail is still in
-- Gmail; without this list the next sync would import it again as a new
-- ticket. Ingestion skips any id listed here, same as an ingested one.
CREATE TABLE IF NOT EXISTS _GMAIL_PURGED_MESSAGE (
    Gmail_Message_Id  TEXT PRIMARY KEY,
    Ticket_Number     TEXT,
    Purged_Time       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+05:30', 'now', '+330 minutes'))
);
