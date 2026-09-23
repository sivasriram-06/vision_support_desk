-- Reverting 0037: Status stays a plain picklist (like Product/Classification)
-- with no Open/On Hold/Closed tagging step - the user wants to define the
-- actual SLA/closed/reopen engine explicitly later rather than have it
-- guessed at now, so no bucket concept is attached to Status yet.
ALTER TABLE HD_PICKLIST_VALUE DROP COLUMN Status_Type;
