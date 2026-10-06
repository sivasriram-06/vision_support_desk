const { getDB } = require("../config/db");
const { nowIst, NOW_IST_SQL } = require("../utils/time");


// Shared CRUD over parameterized SQL; each repository just declares its table, primary key and columns.
const createRepository = ({ table, primaryKey, columns }) => {
    // Looked up once; the DB default (datetime('now'), UTC) is never relied on - times are IST.
    let hasCreatedTime = null;
    const tableHasCreatedTime = () => {
        if (hasCreatedTime === null) {
            hasCreatedTime = getDB().prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === "Created_Time");
        }
        return hasCreatedTime;
    };

    // A new row is last modified by its creator at creation, so Modified_By / Modified_Time are never empty.
    const insert = (input) => {
        const db = getDB();
        const data = { ...input };
        if (data.Created_Time === undefined && tableHasCreatedTime()) data.Created_Time = nowIst();
        if (columns.includes("Modified_By") && data.Modified_By === undefined && data.Created_By !== undefined) {
            data.Modified_By = data.Created_By;
        }
        if (columns.includes("Modified_Time") && data.Modified_Time === undefined) {
            data.Modified_Time = data.Created_Time || nowIst();
        }
        const cols = [...new Set([...columns, ...(data.Created_Time !== undefined && tableHasCreatedTime() ? ["Created_Time"] : [])])].filter((col) => data[col] !== undefined);
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
        const cols = Object.keys(data).filter((col) => columns.includes(col) && col !== "Modified_Time");
        if (cols.length === 0) {
            return findById(id);
        }
        const setClause = cols.map((col) => `${col} = @${col}`).join(", ");
        db.prepare(
            `UPDATE ${table} SET ${setClause}, Modified_Time = ${NOW_IST_SQL} WHERE ${primaryKey} = @__id`
        ).run({ ...data, __id: id });
        return findById(id);
    };

    const softDeleteById = (id, modifiedBy) => {
        const db = getDB();
        db.prepare(
            `UPDATE ${table} SET Is_Deleted = 'Y', Modified_By = ?, Modified_Time = ${NOW_IST_SQL} WHERE ${primaryKey} = ?`
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

createRepository.NOW_IST_SQL = NOW_IST_SQL;
module.exports = createRepository;
