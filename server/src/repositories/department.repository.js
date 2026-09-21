const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { DEPARTMENT_COLUMNS } = require("../models/organization.model");

const base = createRepository({
    table: DB_TABLES.DEPARTMENT,
    primaryKey: "Department_Id",
    columns: DEPARTMENT_COLUMNS
});

const findAll = (orgId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.DEPARTMENT} WHERE Org_Id = ? AND Is_Deleted = 'N' ORDER BY Department_Name ASC`
    ).all(orgId);
};

const findBySanitizedName = (orgId, sanitizedName) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.DEPARTMENT} WHERE Org_Id = ? AND Sanitized_Name = ? AND Is_Deleted = 'N'`
    ).get(orgId, sanitizedName);
};

module.exports = { ...base, findAll, findBySanitizedName };
