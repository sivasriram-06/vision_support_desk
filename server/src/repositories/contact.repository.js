const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { CONTACT_COLUMNS } = require("../models/contact.model");
const { parsePagination } = require("../utils/pagination");

const base = createRepository({
    table: DB_TABLES.CONTACT,
    primaryKey: "Contact_Id",
    columns: CONTACT_COLUMNS
});

const findByEmail = (orgId, email) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.CONTACT} WHERE Org_Id = ? AND Email = ? AND Is_Deleted = 'N'`
    ).get(orgId, email);
};

const findAll = (orgId, query = {}) => {
    const db = getDB();
    const { limit, offset, page } = parsePagination(query);
    const params = [orgId];
    let where = "Org_Id = ? AND Is_Deleted = 'N'";

    if (query.search) {
        where += " AND (Email LIKE ? OR First_Name LIKE ? OR Last_Name LIKE ?)";
        const term = `%${query.search}%`;
        params.push(term, term, term);
    }

    const rows = db.prepare(
        `SELECT * FROM ${DB_TABLES.CONTACT} WHERE ${where} ORDER BY Created_Time DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    const total = db.prepare(
        `SELECT COUNT(*) AS total FROM ${DB_TABLES.CONTACT} WHERE ${where}`
    ).get(...params).total;

    return { rows, total, page, limit };
};

module.exports = { ...base, findByEmail, findAll };
