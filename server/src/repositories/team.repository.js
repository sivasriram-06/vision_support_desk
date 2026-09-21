const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { TEAM_COLUMNS } = require("../models/organization.model");

const base = createRepository({
    table: DB_TABLES.TEAM,
    primaryKey: "Team_Id",
    columns: TEAM_COLUMNS
});

const findAll = (orgId, { departmentId } = {}) => {
    const db = getDB();
    if (departmentId) {
        return db.prepare(
            `SELECT * FROM ${DB_TABLES.TEAM} WHERE Org_Id = ? AND Department_Id = ? AND Is_Deleted = 'N' ORDER BY Team_Name ASC`
        ).all(orgId, departmentId);
    }
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.TEAM} WHERE Org_Id = ? AND Is_Deleted = 'N' ORDER BY Team_Name ASC`
    ).all(orgId);
};

module.exports = { ...base, findAll };
