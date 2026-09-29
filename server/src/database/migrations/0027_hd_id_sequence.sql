-- HD_ID_SEQUENCE: one running counter per table for primary keys
-- (utils/generate-id.js). Every table's ids start at 100000 and count up:
-- first agent 100000, first bank 100000, first ticket 100000 ...
-- Ids are unique within their own table. Stored as TEXT in the *_Id
-- columns, so the 7th digit (after 999999) needs no schema change.
CREATE TABLE IF NOT EXISTS HD_ID_SEQUENCE (
    Table_Name      TEXT PRIMARY KEY,
    Last_Id         INTEGER NOT NULL
);
