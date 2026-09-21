const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { AGENT_COLUMNS } = require("../models/agent.model");

const base = createRepository({
    table: DB_TABLES.AGENT,
    primaryKey: "Agent_Id",
    columns: AGENT_COLUMNS
});

const findByEmail = (orgId, email) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.AGENT} WHERE Org_Id = ? AND Email = ? AND Is_Deleted = 'N'`
    ).get(orgId, email);
};

const findAll = (orgId, { departmentId } = {}) => {
    const db = getDB();
    if (departmentId) {
        return db.prepare(
            `SELECT * FROM ${DB_TABLES.AGENT} WHERE Org_Id = ? AND Primary_Department_Id = ? AND Is_Deleted = 'N' ORDER BY First_Name ASC`
        ).all(orgId, departmentId);
    }
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.AGENT} WHERE Org_Id = ? AND Is_Deleted = 'N' ORDER BY First_Name ASC`
    ).all(orgId);
};

module.exports = { ...base, findByEmail, findAll };
