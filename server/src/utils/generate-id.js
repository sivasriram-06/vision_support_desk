const { getDB } = require("../config/db");

const FIRST_ID = 100000;

/**
 * Next primary key for `table` (a DB_TABLES value): a per-table running
 * number starting at 100000 (HD_ID_SEQUENCE), returned as a string to fit
 * the TEXT *_Id columns. better-sqlite3 is synchronous and single-writer,
 * so the upsert + RETURNING is atomic; inside a caller's transaction the
 * counter rolls back with it.
 */
const generateId = (table) => {
    if (!table) throw new Error("generateId(table) needs the table name");
    const row = getDB().prepare(
        `INSERT INTO HD_ID_SEQUENCE (Table_Name, Last_Id) VALUES (?, ?)
         ON CONFLICT (Table_Name) DO UPDATE SET Last_Id = Last_Id + 1
         RETURNING Last_Id`
    ).get(table, FIRST_ID);
    return String(row.Last_Id);
};

module.exports = generateId;
