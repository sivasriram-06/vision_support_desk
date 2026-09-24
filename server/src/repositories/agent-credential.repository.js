const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const { AGENT_CREDENTIAL_COLUMNS } = require("../models/agent.model");

const base = createRepository({
    table: DB_TABLES.AGENT_CREDENTIAL,
    primaryKey: "Agent_Credential_Id",
    columns: AGENT_CREDENTIAL_COLUMNS
});

const findByAgentId = (agentId) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.AGENT_CREDENTIAL} WHERE Agent_Id = ? AND Is_Deleted = 'N'`
    ).get(agentId);
};

module.exports = { ...base, findByAgentId };
