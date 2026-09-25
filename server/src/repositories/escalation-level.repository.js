const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { ESCALATION_LEVEL_COLUMNS } = require("../models/escalation.model");

const base = createRepository({
    table: DB_TABLES.ESCALATION_LEVEL,
    primaryKey: "Escalation_Level_Id",
    columns: ESCALATION_LEVEL_COLUMNS
});

const findAll = (orgId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.ESCALATION_LEVEL} WHERE Org_Id = ? AND Is_Deleted = 'N' ORDER BY Priority ASC, Level_No ASC`
    ).all(orgId);
};

/** A priority's levels, lowest first. */
const findByPriority = (orgId, priority) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.ESCALATION_LEVEL} WHERE Org_Id = ? AND Priority = ? AND Is_Deleted = 'N' ORDER BY Level_No ASC`
    ).all(orgId, priority);
};

const findByPriorityAndLevel = (orgId, priority, levelNo) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.ESCALATION_LEVEL} WHERE Org_Id = ? AND Priority = ? AND Level_No = ? AND Is_Deleted = 'N'`
    ).get(orgId, priority, levelNo);
};

module.exports = { ...base, findAll, findByPriority, findByPriorityAndLevel };
