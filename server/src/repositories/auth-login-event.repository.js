const { getDB } = require("../config/db");
const DB_TABLES = require("../constants/db-tables");
const generateId = require("../utils/generate-id");

// HD_AUTH_LOGIN_EVENT is append-only (no Is_Deleted / Modified_* columns),
// so it doesn't use the base repository's CRUD helpers.

const record = ({ agentId = null, eventType, loginEmail = null, failureCode = null, ipAddress = null, userAgent = null, orgId }) => {
    const db = getDB();
    db.prepare(
        `INSERT INTO ${DB_TABLES.AUTH_LOGIN_EVENT}
            (Login_Event_Id, Agent_Id, Event_Type, Identity_Provider, Login_Email, Failure_Code, Ip_Address, User_Agent, Org_Id)
         VALUES (?, ?, ?, 'LOCAL', ?, ?, ?, ?, ?)`
    ).run(generateId(), agentId, eventType, loginEmail, failureCode, ipAddress, userAgent ? userAgent.slice(0, 300) : null, orgId);
};

const findRecent = (orgId, limit = 100) => {
    const db = getDB();
    return db.prepare(
        `SELECT e.Login_Event_Id, e.Agent_Id, e.Event_Type, e.Login_Email, e.Failure_Code, e.Event_Time, e.Ip_Address,
                a.First_Name, a.Last_Name
         FROM ${DB_TABLES.AUTH_LOGIN_EVENT} e
         LEFT JOIN ${DB_TABLES.AGENT} a ON a.Agent_Id = e.Agent_Id
         WHERE e.Org_Id = ?
         ORDER BY e.Event_Time DESC
         LIMIT ?`
    ).all(orgId, limit);
};

module.exports = { record, findRecent };
