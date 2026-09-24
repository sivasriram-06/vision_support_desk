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

// Agent row joined with its team (Primary_Department_Id -> department) and
// built-in role, plus whether a sign-in credential exists. Never selects
// the password hash itself.
const DIRECTORY_SELECT = `
    SELECT a.*,
           d.Department_Name AS Team_Name,
           r.Role_Name, r.Role_Key, r.Sort_Order AS Role_Sort_Order,
           CASE WHEN c.Agent_Credential_Id IS NULL THEN 'N' ELSE 'Y' END AS Has_Login,
           c.Must_Change_Password, c.Last_Login_Time, c.Locked_Until
    FROM ${DB_TABLES.AGENT} a
    LEFT JOIN ${DB_TABLES.DEPARTMENT} d ON d.Department_Id = a.Primary_Department_Id AND d.Is_Deleted = 'N'
    LEFT JOIN ${DB_TABLES.ROLE} r ON r.Role_Id = a.Role_Id AND r.Role_Key IS NOT NULL AND r.Is_Deleted = 'N'
    LEFT JOIN ${DB_TABLES.AGENT_CREDENTIAL} c ON c.Agent_Id = a.Agent_Id AND c.Is_Deleted = 'N'
`;

const findAll = (orgId, { departmentId } = {}) => {
    const db = getDB();
    const departmentClause = departmentId ? "AND a.Primary_Department_Id = @departmentId" : "";
    return db.prepare(
        `${DIRECTORY_SELECT}
         WHERE a.Org_Id = @orgId AND a.Is_Deleted = 'N' ${departmentClause}
         ORDER BY d.Department_Name IS NULL, d.Department_Name ASC, r.Sort_Order IS NULL, r.Sort_Order ASC, a.First_Name ASC`
    ).all({ orgId, departmentId });
};

const findDirectoryById = (agentId) => {
    const db = getDB();
    return db.prepare(`${DIRECTORY_SELECT} WHERE a.Agent_Id = ? AND a.Is_Deleted = 'N'`).get(agentId);
};

module.exports = { ...base, findByEmail, findAll, findDirectoryById };
