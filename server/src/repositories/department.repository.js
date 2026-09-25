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

/** Follows a Team Type rename on the Config page. */
const renameTeamType = (orgId, oldType, newType, modifiedBy) => {
    const db = getDB();
    db.prepare(
        `UPDATE ${DB_TABLES.DEPARTMENT} SET Team_Type = ?, Modified_By = ?, Modified_Time = datetime('now')
         WHERE Org_Id = ? AND Team_Type = ? AND Is_Deleted = 'N'`
    ).run(newType, modifiedBy, orgId, oldType);
};

module.exports = { ...base, findAll, findBySanitizedName, renameTeamType };
