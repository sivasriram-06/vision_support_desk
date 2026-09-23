const fs = require("fs");
const path = require("path");
const { connectDB, closeDB } = require("../config/db");
const generateId = require("../utils/generate-id");
const logger = require("../utils/logger");
const organizationRepository = require("../repositories/organization.repository");
const departmentRepository = require("../repositories/department.repository");
const roleRepository = require("../repositories/role.repository");
const teamRepository = require("../repositories/team.repository");
const agentRepository = require("../repositories/agent.repository");
const contactRepository = require("../repositories/contact.repository");
const picklistRepository = require("../repositories/picklist.repository");
const { PICKLIST_FIELD } = require("../constants/picklist.constants");
const { SYSTEM_AGENT_EMAIL } = require("../services/organization.service");

const DATA_FILE = path.join(__dirname, "seed-data", "zoho-reference.json");

/**
 * One-off, idempotent import of real reference data extracted from the
 * tenant's Zoho Desk backup (docs/Zoho_Desk_Table_Config.xlsx sibling
 * export) - everything except tickets, which this app builds from Gmail
 * ingestion instead. Safe to re-run: every insert is guarded by a
 * find-by-natural-key check, so already-imported or ingestion-created rows
 * (e.g. contacts Gmail already created) are left untouched.
 * Usage: node src/database/import-zoho-reference-data.js
 */
const importReferenceData = () => {
    connectDB();

    if (!fs.existsSync(DATA_FILE)) {
        throw new Error(`Reference data file not found: ${DATA_FILE}`);
    }
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    const org = organizationRepository.findFirst();
    if (!org) {
        throw new Error("No organization found. Run `npm run seed` before importing reference data.");
    }
    const systemAgent = agentRepository.findByEmail(org.Organization_Id, SYSTEM_AGENT_EMAIL);
    if (!systemAgent) {
        throw new Error("System agent not found. Run `npm run seed` before importing reference data.");
    }
    const sunoidaDepartment = departmentRepository.findBySanitizedName(org.Organization_Id, "sunoida");
    if (!sunoidaDepartment) {
        throw new Error("Default department not found. Run `npm run seed` before importing reference data.");
    }

    // --- Departments: the seeded "sunoida" department already exists; only
    // add the other real departments from the backup. ---
    const zohoDeptIdToOurId = { [data.departments.find((d) => d.sanitizedName === "sunoida").zohoId]: sunoidaDepartment.Department_Id };
    let departmentsCreated = 0;
    for (const dept of data.departments) {
        if (dept.sanitizedName === "sunoida") continue;
        let ourDept = departmentRepository.findBySanitizedName(org.Organization_Id, dept.sanitizedName);
        if (!ourDept) {
            const departmentId = generateId();
            departmentRepository.insert({
                Department_Id: departmentId,
                Department_Name: dept.name,
                Sanitized_Name: dept.sanitizedName,
                Creator_Agent_Id: systemAgent.Agent_Id,
                Is_Default: "N",
                Is_Enabled: dept.isEnabled ? "Y" : "N",
                Is_Visible_To_Contacts: "Y",
                Created_By: systemAgent.Agent_Id,
                Org_Id: org.Organization_Id
            });
            ourDept = departmentRepository.findById(departmentId);
            departmentsCreated += 1;
        }
        zohoDeptIdToOurId[dept.zohoId] = ourDept.Department_Id;
    }
    logger.info(`Departments: ${departmentsCreated} created, ${data.departments.length - departmentsCreated} already present.`);

    // --- Roles: insert flat first (Parent_Role_Id needs the target row to
    // already exist), then wire up the reporting hierarchy in a second pass. ---
    const zohoRoleIdToOurId = {};
    let rolesCreated = 0;
    for (const role of data.roles) {
        let ourRole = roleRepository.findByName(org.Organization_Id, role.name);
        if (!ourRole) {
            const roleId = generateId();
            roleRepository.insert({
                Role_Id: roleId,
                Role_Name: role.name,
                Created_By: systemAgent.Agent_Id,
                Org_Id: org.Organization_Id
            });
            ourRole = roleRepository.findById(roleId);
            rolesCreated += 1;
        }
        zohoRoleIdToOurId[role.zohoId] = ourRole.Role_Id;
    }
    for (const role of data.roles) {
        if (!role.reportsToZohoId) continue;
        const parentId = zohoRoleIdToOurId[role.reportsToZohoId];
        const ourRole = roleRepository.findById(zohoRoleIdToOurId[role.zohoId]);
        if (parentId && ourRole && !ourRole.Parent_Role_Id) {
            roleRepository.updateById(ourRole.Role_Id, { Parent_Role_Id: parentId, Modified_By: systemAgent.Agent_Id });
        }
    }
    logger.info(`Roles: ${rolesCreated} created, ${data.roles.length - rolesCreated} already present.`);

    // --- Teams ---
    let teamsCreated = 0;
    for (const team of data.teams) {
        const departmentId = zohoDeptIdToOurId[team.departmentZohoId] || sunoidaDepartment.Department_Id;
        const existing = teamRepository.findByName(org.Organization_Id, departmentId, team.name);
        if (!existing) {
            teamRepository.insert({
                Team_Id: generateId(),
                Team_Name: team.name,
                Department_Id: departmentId,
                Created_By: systemAgent.Agent_Id,
                Org_Id: org.Organization_Id
            });
            teamsCreated += 1;
        }
    }
    logger.info(`Teams: ${teamsCreated} created, ${data.teams.length - teamsCreated} already present.`);

    // --- Agents ---
    let agentsCreated = 0;
    for (const agent of data.agents) {
        if (!agent.email || agent.email === SYSTEM_AGENT_EMAIL) continue;
        const existing = agentRepository.findByEmail(org.Organization_Id, agent.email);
        if (existing) continue;
        agentRepository.insert({
            Agent_Id: generateId(),
            Zuid: agent.zohoId,
            First_Name: agent.firstName || "Agent",
            Last_Name: agent.lastName || "Unknown",
            Email: agent.email,
            Mobile: agent.mobile,
            Phone: agent.phone,
            Status: agent.status,
            Role_Id: zohoRoleIdToOurId[agent.roleZohoId] || null,
            Primary_Department_Id: zohoDeptIdToOurId[agent.departmentZohoId] || sunoidaDepartment.Department_Id,
            Timezone: agent.timezone,
            Language: agent.language,
            Country_Code: agent.countryCode,
            Is_Confirmed: agent.isConfirmed ? "Y" : "N",
            Created_By: systemAgent.Agent_Id,
            Org_Id: org.Organization_Id
        });
        agentsCreated += 1;
    }
    logger.info(`Agents: ${agentsCreated} created, ${data.agents.length - agentsCreated} already present.`);

    // --- Contacts: skip anything Gmail ingestion already created (same
    // email), so re-running this import never duplicates a live contact. ---
    let contactsCreated = 0;
    for (const contact of data.contacts) {
        if (!contact.email) continue;
        const existing = contactRepository.findByEmail(org.Organization_Id, contact.email);
        if (existing) continue;
        contactRepository.insert({
            Contact_Id: generateId(),
            First_Name: contact.firstName,
            Last_Name: contact.lastName,
            Email: contact.email,
            Phone: contact.phone,
            Mobile: contact.mobile,
            Is_End_User: contact.isEndUser ? "Y" : "N",
            Is_Spam: contact.isSpam ? "Y" : "N",
            Owner_Agent_Id: systemAgent.Agent_Id,
            External_Crm_Contact_Id: contact.zohoId,
            Created_By: systemAgent.Agent_Id,
            Org_Id: org.Organization_Id
        });
        contactsCreated += 1;
    }
    logger.info(`Contacts: ${contactsCreated} created, ${data.contacts.length - contactsCreated} already present or skipped.`);

    // --- Classification picklist values ---
    let classificationsCreated = 0;
    data.classifications.forEach((value, index) => {
        const existing = picklistRepository.findByValue(org.Organization_Id, PICKLIST_FIELD.CLASSIFICATION, value);
        if (!existing) {
            picklistRepository.insert({
                Picklist_Value_Id: generateId(),
                Field: PICKLIST_FIELD.CLASSIFICATION,
                Value: value,
                Sort_Order: index,
                Created_By: systemAgent.Agent_Id,
                Org_Id: org.Organization_Id
            });
            classificationsCreated += 1;
        }
    });
    logger.info(`Classifications: ${classificationsCreated} created, ${data.classifications.length - classificationsCreated} already present.`);

    logger.info("Zoho reference data import complete.");
};

if (require.main === module) {
    try {
        importReferenceData();
        closeDB();
        process.exit(0);
    } catch (error) {
        logger.error("Reference data import failed:", error);
        closeDB();
        process.exit(1);
    }
}

module.exports = { importReferenceData };
