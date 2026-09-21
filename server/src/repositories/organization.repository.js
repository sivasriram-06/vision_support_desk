const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { ORGANIZATION_COLUMNS } = require("../models/organization.model");

const base = createRepository({
    table: DB_TABLES.ORGANIZATION,
    primaryKey: "Organization_Id",
    columns: ORGANIZATION_COLUMNS
});

const findFirst = () => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.ORGANIZATION} WHERE Is_Deleted = 'N' ORDER BY Created_Time ASC LIMIT 1`
    ).get();
};

module.exports = { ...base, findFirst };
