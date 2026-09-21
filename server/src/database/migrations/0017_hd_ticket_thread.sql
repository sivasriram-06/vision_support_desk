-- HD_TICKET_THREAD: email-specific threaded view of a ticket's messages.
-- Message_Id_Header carries the RFC 5322 Message-ID (and, for Gmail, we also
-- store the Gmail API message id there when no header is present) - its
-- UNIQUE index is what makes Gmail ingestion idempotent: re-processing the
-- same message is a safe no-op instead of creating a duplicate thread/ticket.
CREATE TABLE IF NOT EXISTS HD_TICKET_THREAD (
    Thread_Id             TEXT PRIMARY KEY,
    Ticket_Id             TEXT NOT NULL REFERENCES HD_TICKET_MASTER (Ticket_Id),
    Conversation_Id       TEXT REFERENCES HD_TICKET_CONVERSATION (Conversation_Id),
    Message_Id_Header      TEXT,
    In_Reply_To_Header      TEXT,
    Channel               TEXT NOT NULL DEFAULT 'EMAIL',
    Direction             TEXT CHECK (Direction IN ('in', 'out')),
    Created_By            TEXT NOT NULL,
    Created_Time          TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By           TEXT,
    Modified_Time         TEXT,
    Is_Deleted             TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_thread_message_id ON HD_TICKET_THREAD (Message_Id_Header) WHERE Message_Id_Header IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_thread_ticket ON HD_TICKET_THREAD (Ticket_Id);
CREATE INDEX IF NOT EXISTS idx_thread_in_reply_to ON HD_TICKET_THREAD (In_Reply_To_Header);
