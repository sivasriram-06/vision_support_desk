const { getDB } = require("../config/db");
const createRepository = require("./base.repository");
const DB_TABLES = require("../constants/db-tables");
const generateId = require("../utils/generate-id");
const { BANK_COLUMNS } = require("../models/organization.model");

const base = createRepository({
    table: DB_TABLES.BANK,
    primaryKey: "Bank_Id",
    columns: BANK_COLUMNS
});

// Bank row + its support team's name. Resources are attached separately
// (attachResources) so one query serves both list and detail.
const DETAIL_SELECT = `
    SELECT b.*, d.Department_Name AS Support_Team_Name
    FROM ${DB_TABLES.BANK} b
    LEFT JOIN ${DB_TABLES.DEPARTMENT} d ON d.Department_Id = b.Department_Id AND d.Is_Deleted = 'N'
`;

const attachResources = (banks) => {
    if (banks.length === 0) return banks;
    const db = getDB();
    const placeholders = banks.map(() => "?").join(", ");
    const rows = db.prepare(
        `SELECT r.Bank_Id, r.Resource_Type, a.Agent_Id, a.First_Name, a.Last_Name, a.Email, a.Status
         FROM ${DB_TABLES.BANK_RESOURCE_MAP} r
         JOIN ${DB_TABLES.AGENT} a ON a.Agent_Id = r.Agent_Id AND a.Is_Deleted = 'N'
         WHERE r.Is_Deleted = 'N' AND r.Bank_Id IN (${placeholders})
         ORDER BY a.First_Name ASC`
    ).all(...banks.map((b) => b.Bank_Id));

    const byBank = new Map(banks.map((b) => [b.Bank_Id, { primary: [], secondary: [] }]));
    for (const row of rows) {
        const { Bank_Id: bankId, Resource_Type: type, ...agent } = row;
        byBank.get(bankId)[type === "PRIMARY" ? "primary" : "secondary"].push(agent);
    }
    return banks.map((b) => ({
        ...b,
        Primary_Resources: byBank.get(b.Bank_Id).primary,
        Secondary_Resources: byBank.get(b.Bank_Id).secondary
    }));
};

const findAll = (orgId, { departmentId } = {}) => {
    const db = getDB();
    const departmentClause = departmentId ? "AND b.Department_Id = @departmentId" : "";
    const banks = db.prepare(
        `${DETAIL_SELECT}
         WHERE b.Org_Id = @orgId AND b.Is_Deleted = 'N' ${departmentClause}
         ORDER BY b.Bank_Name ASC`
    ).all({ orgId, departmentId });
    return attachResources(banks);
};

const findDetailById = (bankId) => {
    const db = getDB();
    const bank = db.prepare(`${DETAIL_SELECT} WHERE b.Bank_Id = ? AND b.Is_Deleted = 'N'`).get(bankId);
    return bank ? attachResources([bank])[0] : null;
};

/** Bank names are unique across the org (case-insensitive) - a bank is worked by exactly one support team. */
const findByName = (orgId, bankName) => {
    const db = getDB();
    return db.prepare(
        `SELECT * FROM ${DB_TABLES.BANK} WHERE Org_Id = ? AND Bank_Name = ? COLLATE NOCASE AND Is_Deleted = 'N'`
    ).get(orgId, bankName);
};

const hasResources = (bankId) => {
    const db = getDB();
    return !!db.prepare(
        `SELECT 1 FROM ${DB_TABLES.BANK_RESOURCE_MAP} WHERE Bank_Id = ? AND Is_Deleted = 'N' LIMIT 1`
    ).get(bankId);
};

/**
 * Replaces one resource type's agent list for a bank: rows no longer
 * listed are soft-deleted, new ones inserted, unchanged ones kept.
 */
const replaceResources = (bankId, resourceType, agentIds, { actorAgentId, orgId }) => {
    const db = getDB();
    const current = db.prepare(
        `SELECT Bank_Resource_Id, Agent_Id FROM ${DB_TABLES.BANK_RESOURCE_MAP}
         WHERE Bank_Id = ? AND Resource_Type = ? AND Is_Deleted = 'N'`
    ).all(bankId, resourceType);
    const wanted = new Set(agentIds);

    for (const row of current) {
        if (!wanted.has(row.Agent_Id)) {
            db.prepare(
                `UPDATE ${DB_TABLES.BANK_RESOURCE_MAP} SET Is_Deleted = 'Y', Modified_By = ?, Modified_Time = datetime('now') WHERE Bank_Resource_Id = ?`
            ).run(actorAgentId, row.Bank_Resource_Id);
        }
    }
    const existing = new Set(current.map((row) => row.Agent_Id));
    for (const agentId of wanted) {
        if (existing.has(agentId)) continue;
        db.prepare(
            `INSERT INTO ${DB_TABLES.BANK_RESOURCE_MAP} (Bank_Resource_Id, Bank_Id, Agent_Id, Resource_Type, Created_By, Org_Id)
             VALUES (?, ?, ?, ?, ?, ?)`
        ).run(generateId(), bankId, agentId, resourceType, actorAgentId, orgId);
    }
};

module.exports = { ...base, findAll, findDetailById, findByName, hasResources, replaceResources };
