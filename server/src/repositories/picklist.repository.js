const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { PICKLIST_VALUE_COLUMNS } = require("../models/picklist.model");

const base = createRepository({
    table: DB_TABLES.PICKLIST_VALUE,
    primaryKey: "Picklist_Value_Id",
    columns: PICKLIST_VALUE_COLUMNS
});

/**
 * parentValue is only meaningful for Field='CATEGORY' (its owning
 * Classification's Value text) - omit it to list every row for the field
 * regardless of parent, pass it to scope to just that parent's children.
 */
const findAll = (orgId, field, parentValue) => {
    const db = getDB();
    if (parentValue !== undefined) {
        return db.prepare(
            `SELECT * FROM ${DB_TABLES.PICKLIST_VALUE} WHERE Org_Id = ? AND Field = ? AND Parent_Value = ? AND Is_Deleted = 'N' ORDER BY Sort_Order ASC, Value ASC`
        ).all(orgId, field, parentValue);
    }
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.PICKLIST_VALUE} WHERE Org_Id = ? AND Field = ? AND Is_Deleted = 'N' ORDER BY Sort_Order ASC, Value ASC`
    ).all(orgId, field);
};

const findByValue = (orgId, field, value, parentValue = null) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.PICKLIST_VALUE}
         WHERE Org_Id = ? AND Field = ? AND Value = ? AND Is_Deleted = 'N'
         AND COALESCE(Parent_Value, '') = COALESCE(?, '')`
    ).get(orgId, field, value, parentValue);
};

const findByParentValue = (orgId, field, parentValue) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.PICKLIST_VALUE} WHERE Org_Id = ? AND Field = ? AND Parent_Value = ? AND Is_Deleted = 'N'`
    ).all(orgId, field, parentValue);
};

const renameParentValue = (orgId, field, oldParentValue, newParentValue, modifiedBy) => {
    const db = getDB();
    db.prepare(
        `UPDATE ${DB_TABLES.PICKLIST_VALUE} SET Parent_Value = ?, Modified_By = ?, Modified_Time = datetime('now')
         WHERE Org_Id = ? AND Field = ? AND Parent_Value = ? AND Is_Deleted = 'N'`
    ).run(newParentValue, modifiedBy, orgId, field, oldParentValue);
};

module.exports = { ...base, findAll, findByValue, findByParentValue, renameParentValue };
