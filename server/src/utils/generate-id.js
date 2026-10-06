const { getDB } = require("../config/db");

const FIRST_ID = 100000;

// Per-table running id (as text); atomic since better-sqlite3 is single-writer, and rolls back with the caller.
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
