const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { ROLE_COLUMNS } = require("../models/agent.model");

const base = createRepository({
    table: DB_TABLES.ROLE,
    primaryKey: "Role_Id",
    columns: ROLE_COLUMNS
});

const findByName = (orgId, roleName) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.ROLE} WHERE Org_Id = ? AND Role_Name = ? AND Is_Deleted = 'N'`
    ).get(orgId, roleName);
};

const findByKey = (orgId, roleKey) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.ROLE} WHERE Org_Id = ? AND Role_Key = ? AND Is_Deleted = 'N'`
    ).get(orgId, roleKey);
};

/** Only the app's built-in roles (Role_Key set) - legacy Zoho-imported roles are not offered. */
const findAllKeyed = (orgId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.ROLE} WHERE Org_Id = ? AND Role_Key IS NOT NULL AND Is_Deleted = 'N' ORDER BY Sort_Order ASC, Role_Name ASC`
    ).all(orgId);
};

module.exports = { ...base, findByName, findByKey, findAllKeyed };
