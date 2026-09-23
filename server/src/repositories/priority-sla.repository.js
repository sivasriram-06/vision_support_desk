const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { PRIORITY_SLA_CONFIG_COLUMNS } = require("../models/priority-sla.model");

const base = createRepository({
    table: DB_TABLES.PRIORITY_SLA_CONFIG,
    primaryKey: "Priority_Sla_Config_Id",
    columns: PRIORITY_SLA_CONFIG_COLUMNS
});

const findAll = (orgId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.PRIORITY_SLA_CONFIG} WHERE Org_Id = ? AND Is_Deleted = 'N' ORDER BY Created_Time ASC, rowid ASC`
    ).all(orgId);
};

const findByPriority = (orgId, priority) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.PRIORITY_SLA_CONFIG} WHERE Org_Id = ? AND Priority = ? AND Is_Deleted = 'N'`
    ).get(orgId, priority);
};

module.exports = { ...base, findAll, findByPriority };
