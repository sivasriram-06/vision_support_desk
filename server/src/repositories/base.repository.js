const { getDB } = require("../config/db");

/**
 * Factory that gives every HD_* table repository the same CRUD primitives
 * over raw parameterized SQL (better-sqlite3), so individual repositories
 * only need to declare their table, primary key and columns, plus any
 * table-specific queries.
 */
const createRepository = ({ table, primaryKey, columns }) => {
    const insert = (data) => {
        const db = getDB();
        const cols = columns.filter((col) => data[col] !== undefined);
        const placeholders = cols.map((col) => `@${col}`).join(", ");
        const stmt = db.prepare(
            `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`
        );
        stmt.run(data);
        return data[primaryKey];
    };

    const findById = (id, { includeDeleted = false } = {}) => {
        const db = getDB();
        const clause = includeDeleted ? "" : "AND Is_Deleted = 'N'";
        return db.prepare(
            `SELECT * FROM ${table} WHERE ${primaryKey} = ? ${clause}`
        ).get(id);
    };

    const updateById = (id, data) => {
        const db = getDB();
        const cols = Object.keys(data).filter((col) => columns.includes(col));
        if (cols.length === 0) {
            return findById(id);
        }
        const setClause = cols.map((col) => `${col} = @${col}`).join(", ");
        db.prepare(
            `UPDATE ${table} SET ${setClause}, Modified_Time = datetime('now') WHERE ${primaryKey} = @__id`
        ).run({ ...data, __id: id });
        return findById(id);
    };

    const softDeleteById = (id, modifiedBy) => {
        const db = getDB();
        db.prepare(
            `UPDATE ${table} SET Is_Deleted = 'Y', Modified_By = ?, Modified_Time = datetime('now') WHERE ${primaryKey} = ?`
        ).run(modifiedBy, id);
    };

    const count = ({ where = "1=1", params = [] } = {}) => {
        const db = getDB();
        const row = db.prepare(
            `SELECT COUNT(*) AS total FROM ${table} WHERE Is_Deleted = 'N' AND ${where}`
        ).get(...params);
        return row.total;
    };

    return { table, primaryKey, columns, insert, findById, updateById, softDeleteById, count };
};

module.exports = createRepository;
