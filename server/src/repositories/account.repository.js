const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { ACCOUNT_COLUMNS } = require("../models/contact.model");
const { parsePagination } = require("../utils/pagination");

const base = createRepository({
    table: DB_TABLES.ACCOUNT,
    primaryKey: "Account_Id",
    columns: ACCOUNT_COLUMNS
});

const findAll = (orgId, query = {}) => {
    const db = getDB();
    const { limit, offset, page } = parsePagination(query);
    const params = [orgId];
    let where = "Org_Id = ? AND Is_Deleted = 'N'";

    if (query.search) {
        where += " AND Account_Name LIKE ?";
        params.push(`%${query.search}%`);
    }

    const rows = db.prepare(
        `SELECT * FROM ${DB_TABLES.ACCOUNT} WHERE ${where} ORDER BY Account_Name ASC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    const total = db.prepare(
        `SELECT COUNT(*) AS total FROM ${DB_TABLES.ACCOUNT} WHERE ${where}`
    ).get(...params).total;

    return { rows, total, page, limit };
};

module.exports = { ...base, findAll };
