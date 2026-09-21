-- HD_TICKET_ATTACHMENT: metadata and storage location for files attached to
-- a ticket. The file bytes themselves live on disk under ATTACHMENTS_DIR
-- (see src/utils/file-storage.js); Storage_Path is the path relative to
-- that root, not an absolute path, so the root can move between
-- environments without invalidating existing rows.
CREATE TABLE IF NOT EXISTS HD_TICKET_ATTACHMENT (
    Attachment_Id          TEXT PRIMARY KEY,
    Ticket_Id              TEXT NOT NULL REFERENCES HD_TICKET_MASTER (Ticket_Id),
    Conversation_Id        TEXT REFERENCES HD_TICKET_CONVERSATION (Conversation_Id),
    File_Name              TEXT NOT NULL,
    File_Size_Bytes        INTEGER,
    Mime_Type              TEXT,
    Storage_Path           TEXT NOT NULL,
    Uploaded_By_Agent_Id   TEXT REFERENCES HD_AGENT_MASTER (Agent_Id),
    Uploaded_Time          TEXT NOT NULL,
    Created_By             TEXT NOT NULL,
    Created_Time           TEXT NOT NULL DEFAULT (datetime('now')),
    Modified_By            TEXT,
    Modified_Time          TEXT,
    Is_Deleted             TEXT NOT NULL DEFAULT 'N' CHECK (Is_Deleted IN ('Y', 'N')),
    Org_Id                 TEXT NOT NULL REFERENCES HD_ORGANIZATION_MASTER (Organization_Id)
);

CREATE INDEX IF NOT EXISTS idx_attachment_ticket ON HD_TICKET_ATTACHMENT (Ticket_Id);
CREATE INDEX IF NOT EXISTS idx_attachment_conversation ON HD_TICKET_ATTACHMENT (Conversation_Id);
