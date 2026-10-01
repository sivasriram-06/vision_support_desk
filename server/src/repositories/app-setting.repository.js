const { getDB } = require("../config/db");
const DB_TABLES = require("../constants/db-tables");
const { NOW_IST_SQL } = require("../utils/time");

// HD_APP_SETTING: one value per (Org_Id, Setting_Key).

const get = (orgId, key) => getDB().prepare(
    `SELECT Setting_Value FROM ${DB_TABLES.APP_SETTING} WHERE Org_Id = ? AND Setting_Key = ?`
).get(orgId, key)?.Setting_Value ?? null;

const set = (orgId, key, value, actorAgentId) => {
    getDB().prepare(
        `INSERT INTO ${DB_TABLES.APP_SETTING} (Org_Id, Setting_Key, Setting_Value, Modified_By, Modified_Time)
         VALUES (?, ?, ?, ?, ${NOW_IST_SQL})
         ON CONFLICT (Org_Id, Setting_Key) DO UPDATE SET
             Setting_Value = excluded.Setting_Value, Modified_By = excluded.Modified_By, Modified_Time = excluded.Modified_Time`
    ).run(orgId, key, value, actorAgentId);
};

module.exports = { get, set };
