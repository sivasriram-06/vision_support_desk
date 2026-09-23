const { connectDB, closeDB } = require("../config/db");
const generateId = require("../utils/generate-id");
const logger = require("../utils/logger");
const organizationRepository = require("../repositories/organization.repository");
const departmentRepository = require("../repositories/department.repository");
const teamRepository = require("../repositories/team.repository");
const agentRepository = require("../repositories/agent.repository");
const { SYSTEM_AGENT_EMAIL } = require("../services/organization.service");

/**
 * One-off, idempotent correction: the org's real grouping for its 40
 * per-bank teams is 5 regional codes (A, B, C, D, RA), not the single
 * "Sunoida Support" department every team was imported under. Creates
 * those 5 departments (skipped if already present) and reassigns each
 * named team's Department_Id to match. Teams not named here are left on
 * whatever department they already have.
 * Usage: node src/database/remap-teams-to-bank-departments.js
 */
const DEPARTMENT_NAMES = ["A", "B", "C", "D", "RA"];

const TEAM_TO_DEPARTMENT = {
    "Alizz Islamic Bank": "A",
    "Credit Bank": "A",
    DTB: "A",
    "IM-KE": "A",
    "IM-RW": "A",
    "IM-TZ": "A",
    "IM-UG": "A",
    MSB: "A",
    "Premier Bank": "A",
    "Prime Bank": "A",
    "Stanbic Bank KE": "A",

    BNR: "B",
    CalBank: "B",
    CBG: "B",
    "Fidelity Bank": "B",
    "First Bank Guinea": "B",
    KDIC: "B",
    "Sidian Bank": "B",
    UMB: "B",

    BOK: "C",
    DIB: "C",
    "Family Bank": "C",
    UBA: "C",

    BankOne: "D",
    FirstBank: "D",
    "SBM Bank": "D",
    "Stanbic UG": "D",

    ENBD: "RA",
    KCB: "RA",
    "NCBA-KE": "RA",
    "NCBA-RW": "RA",
    "NCBA-TZ": "RA",
    "NCBA-UG": "RA",
    "Prime Bank RA": "RA"
};

const remapTeamsToBankDepartments = () => {
    connectDB();

    const org = organizationRepository.findFirst();
    if (!org) {
        throw new Error("No organization found. Run `npm run seed` first.");
    }
    const systemAgent = agentRepository.findByEmail(org.Organization_Id, SYSTEM_AGENT_EMAIL);
    if (!systemAgent) {
        throw new Error("System agent not found. Run `npm run seed` first.");
    }

    const departmentIdByName = {};
    let departmentsCreated = 0;
    for (const name of DEPARTMENT_NAMES) {
        const sanitizedName = name.toLowerCase();
        let department = departmentRepository.findBySanitizedName(org.Organization_Id, sanitizedName);
        if (!department) {
            const departmentId = generateId();
            departmentRepository.insert({
                Department_Id: departmentId,
                Department_Name: name,
                Sanitized_Name: sanitizedName,
                Creator_Agent_Id: systemAgent.Agent_Id,
                Is_Default: "N",
                Is_Enabled: "Y",
                Is_Visible_To_Contacts: "Y",
                Created_By: systemAgent.Agent_Id,
                Org_Id: org.Organization_Id
            });
            department = departmentRepository.findById(departmentId);
            departmentsCreated += 1;
        }
        departmentIdByName[name] = department.Department_Id;
    }
    logger.info(`Departments: ${departmentsCreated} created (A/B/C/D/RA), ${DEPARTMENT_NAMES.length - departmentsCreated} already present.`);

    const allTeams = teamRepository.findAll(org.Organization_Id);
    let reassigned = 0;
    let unmatched = 0;
    for (const team of allTeams) {
        const departmentName = TEAM_TO_DEPARTMENT[team.Team_Name];
        if (!departmentName) {
            unmatched += 1;
            continue;
        }
        const targetDepartmentId = departmentIdByName[departmentName];
        if (team.Department_Id === targetDepartmentId) {
            continue;
        }
        teamRepository.updateById(team.Team_Id, { Department_Id: targetDepartmentId, Modified_By: systemAgent.Agent_Id });
        reassigned += 1;
    }
    logger.info(`Teams: ${reassigned} reassigned to A/B/C/D/RA, ${unmatched} left on their current department (not in the mapping).`);

    logger.info("Team-to-department remap complete.");
};

if (require.main === module) {
    try {
        remapTeamsToBankDepartments();
        closeDB();
        process.exit(0);
    } catch (error) {
        logger.error("Team-to-department remap failed:", error);
        closeDB();
        process.exit(1);
    }
}

module.exports = { remapTeamsToBankDepartments };
