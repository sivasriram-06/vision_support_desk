const env = require("../config/env");
const { connectDB, closeDB } = require("../config/db");
const generateId = require("../utils/generate-id");
const logger = require("../utils/logger");
const organizationRepository = require("../repositories/organization.repository");
const departmentRepository = require("../repositories/department.repository");
const agentRepository = require("../repositories/agent.repository");
const { channel: channelRepository, mailReplyAddress: mailReplyAddressRepository } = require("../repositories/channel.repository");
const roleRepository = require("../repositories/role.repository");
const credentialRepository = require("../repositories/agent-credential.repository");
const authService = require("../services/auth.service");
const { SYSTEM_AGENT_EMAIL } = require("../services/organization.service");
const { DEFAULT_ROLES } = require("../constants/permissions");
const bankRepository = require("../repositories/bank.repository");
const picklistRepository = require("../repositories/picklist.repository");
const productRepository = require("../repositories/product.repository");
const prioritySlaRepository = require("../repositories/priority-sla.repository");
const escalationLevelRepository = require("../repositories/escalation-level.repository");
const { DEFAULT_SUPPORT_START_IST, DEFAULT_SUPPORT_END_IST } = require("../services/sla/business-calendar");
const supportOrg = require("./seed-data/support-org.json");
const productTeamSeed = require("./seed-data/product-teams.json");
const bankSeed = require("./seed-data/banks.json");
const configSeed = require("./seed-data/config.json");

const SUPPORT_MAILBOX = env.google.mailbox;

/**
 * Idempotent bootstrap: safe to run repeatedly. Creates the single tenant
 * org, its default department, the system actor used for Created_By on
 * ingestion-created rows, the Email channel, and the mail reply address the
 * Gmail ingestion engine looks Department_Id up by.
 */
const seed = () => {
    connectDB();

    let org = organizationRepository.findFirst();
    if (!org) {
        const orgId = generateId();
        organizationRepository.insert({
            Organization_Id: orgId,
            Company_Name: "Sunoida",
            Portal_Name: "sunoida",
            Edition: "Enterprise",
            Currency_Code: "INR",
            Currency_Symbol: "Rs.",
            Currency_Locale: "IN",
            Time_Zone: env.timezone,
            Is_Sandbox_Portal: "N",
            Is_Default_Portal: "Y"
        });
        org = organizationRepository.findById(orgId);
        logger.info(`Seeded organization: ${org.Company_Name} (${org.Organization_Id})`);
    }

    let department = departmentRepository.findBySanitizedName(org.Organization_Id, "sunoida");
    if (!department) {
        const departmentId = generateId();
        departmentRepository.insert({
            Department_Id: departmentId,
            Department_Name: "Sunoida Support",
            Sanitized_Name: "sunoida",
            Is_Default: "Y",
            Is_Enabled: "Y",
            Is_Visible_To_Contacts: "Y",
            Org_Id: org.Organization_Id
        });
        department = departmentRepository.findById(departmentId);
        logger.info(`Seeded department: ${department.Department_Name} (${department.Department_Id})`);
    }

    let systemAgent = agentRepository.findByEmail(org.Organization_Id, SYSTEM_AGENT_EMAIL);
    if (!systemAgent) {
        const agentId = generateId();
        agentRepository.insert({
            Agent_Id: agentId,
            Zuid: agentId,
            First_Name: "System",
            Last_Name: "Ingestion",
            Email: SYSTEM_AGENT_EMAIL,
            Status: "Active",
            Primary_Department_Id: department.Department_Id,
            Is_Confirmed: "Y",
            Created_By: agentId,
            Org_Id: org.Organization_Id
        });
        systemAgent = agentRepository.findById(agentId);
        logger.info(`Seeded system agent: ${systemAgent.Email} (${systemAgent.Agent_Id})`);
    }

    // Back-fill Department.Creator_Agent_Id and Organization.Created_By now
    // that the system agent exists (both were NULL at bootstrap time to
    // avoid a circular FK dependency - see migrations 0001/0002).
    if (!department.Creator_Agent_Id) {
        departmentRepository.updateById(department.Department_Id, {
            Creator_Agent_Id: systemAgent.Agent_Id,
            Created_By: systemAgent.Agent_Id
        });
    }
    if (!org.Created_By) {
        organizationRepository.updateById(org.Organization_Id, { Created_By: systemAgent.Agent_Id });
    }

    let emailChannel = channelRepository.findAllChannels(org.Organization_Id)
        .find((row) => row.Channel_Type === "Email");
    if (!emailChannel) {
        const channelId = generateId();
        channelRepository.insert({
            Channel_Id: channelId,
            Channel_Name: "Support Email",
            Channel_Type: "Email",
            Department_Id: department.Department_Id,
            Is_Reply_Enabled: "Y",
            Is_Active: "Y",
            Created_By: systemAgent.Agent_Id,
            Org_Id: org.Organization_Id
        });
        emailChannel = channelRepository.findById(channelId);
        logger.info(`Seeded channel: ${emailChannel.Channel_Name} (${emailChannel.Channel_Id})`);
    }

    let mailReplyAddress = mailReplyAddressRepository.findMailReplyAddressByEmail(SUPPORT_MAILBOX);
    if (!mailReplyAddress) {
        const mailReplyAddressId = generateId();
        mailReplyAddressRepository.insert({
            Mail_Reply_Address_Id: mailReplyAddressId,
            Department_Id: department.Department_Id,
            Display_Name: "Sunoida Support",
            Email_Address: SUPPORT_MAILBOX,
            Is_Verified: "Y",
            Created_By: systemAgent.Agent_Id,
            Org_Id: org.Organization_Id
        });
        mailReplyAddress = mailReplyAddressRepository.findById(mailReplyAddressId);
        logger.info(`Seeded mail reply address: ${mailReplyAddress.Email_Address} (${mailReplyAddress.Mail_Reply_Address_Id})`);
    }

    const roleIdByKey = seedRoles(org.Organization_Id, systemAgent.Agent_Id);
    const teamIdByName = seedSupportTeams(org.Organization_Id, systemAgent.Agent_Id);
    seedSupportAgents(org.Organization_Id, systemAgent.Agent_Id, roleIdByKey, teamIdByName);
    seedBanks(org.Organization_Id, systemAgent.Agent_Id, teamIdByName);
    seedConfig(org.Organization_Id, systemAgent.Agent_Id);

    logger.info("Seed complete.");
};

/**
 * Built-in roles, keyed by Role_Key. Created with their default permission
 * set the first time only - an admin's later edits on the Admin page are
 * never overwritten by re-seeding.
 */
const seedRoles = (orgId, systemAgentId) => {
    const roleIdByKey = {};
    for (const def of DEFAULT_ROLES) {
        let role = roleRepository.findByKey(orgId, def.key);
        if (!role) {
            const roleId = generateId();
            roleRepository.insert({
                Role_Id: roleId,
                Role_Name: def.name,
                Role_Key: def.key,
                Parent_Role_Id: def.parentKey ? roleIdByKey[def.parentKey] : null,
                Permissions_Json: JSON.stringify(def.permissions),
                Sort_Order: def.sortOrder,
                Created_By: systemAgentId,
                Org_Id: orgId
            });
            role = roleRepository.findById(roleId);
            logger.info(`Seeded role: ${role.Role_Name}`);
        }
        roleIdByKey[def.key] = role.Role_Id;
    }
    return roleIdByKey;
};

/**
 * Support teams (seed-data/support-org.json) are departments; each bank is
 * worked by one of them. Created once by Sanitized_Name - a later admin
 * rename in the app is kept.
 */
const seedSupportTeams = (orgId, systemAgentId) => {
    const teamIdByName = {};
    // Support teams from the KB sheet, then the product teams (Java /
    // Angular) that support pulls in by cross-team assignment.
    for (const team of [...supportOrg.teams, ...productTeamSeed.teams]) {
        let department = departmentRepository.findBySanitizedName(orgId, team.sanitizedName);
        if (!department) {
            const departmentId = generateId();
            departmentRepository.insert({
                Department_Id: departmentId,
                Department_Name: team.name,
                Sanitized_Name: team.sanitizedName,
                Team_Type: team.teamType || "Support",
                Is_Default: "N",
                Is_Enabled: "Y",
                Is_Visible_To_Contacts: "N",
                Creator_Agent_Id: systemAgentId,
                Created_By: systemAgentId,
                Org_Id: orgId
            });
            department = departmentRepository.findById(departmentId);
            logger.info(`Seeded support team: ${team.name}`);
        }
        teamIdByName[team.name] = department.Department_Id;
    }
    return teamIdByName;
};

/**
 * The support roster from docs/Vision Support Desk KB.xlsx. Upserts by
 * email: a new agent is created with its team + role; an existing agent
 * (e.g. one Gmail ingestion created for a mail sender) gets team + role only while it has no
 * built-in role yet, so admin changes made in the app survive re-seeding.
 *
 * The support mailbox account (GMAIL_MAILBOX) is also made an Admin - in
 * production that is vision.support@sunoida.com itself.
 *
 * Sign-in: when SEED_DEFAULT_PASSWORD is set, every seeded agent without a
 * credential gets it as a temporary password they must change on first
 * login. Without it, nobody gets a login from the seed - an admin issues
 * passwords from the Admin page instead.
 */
const seedSupportAgents = (orgId, systemAgentId, roleIdByKey, teamIdByName) => {
    const defaultPassword = env.seedDefaultPassword;
    const entries = [...supportOrg.agents, ...productTeamSeed.agents];
    const mailbox = SUPPORT_MAILBOX.trim().toLowerCase();
    if (!entries.some((entry) => entry.email === mailbox)) {
        const [localPart] = mailbox.split("@");
        const [firstName, ...rest] = localPart.split(".");
        const cap = (value) => value.charAt(0).toUpperCase() + value.slice(1);
        entries.push({ firstName: cap(firstName), lastName: rest.map(cap).join(" "), email: mailbox, team: null, role: "ADMIN" });
    }

    let created = 0;
    let updated = 0;
    let credentials = 0;
    for (const entry of entries) {
        const email = entry.email.trim().toLowerCase();
        const roleId = roleIdByKey[entry.role];
        const teamId = entry.team ? teamIdByName[entry.team] : null;
        if (entry.team && !teamId) {
            throw new Error(`Seed agent ${email} references unknown team "${entry.team}"`);
        }

        let agent = agentRepository.findByEmail(orgId, email);
        if (!agent) {
            const agentId = generateId();
            agentRepository.insert({
                Agent_Id: agentId,
                Zuid: agentId,
                First_Name: entry.firstName,
                Last_Name: entry.lastName || "",
                Email: email,
                Status: "Active",
                Role_Id: roleId,
                Primary_Department_Id: teamId,
                Is_Confirmed: "Y",
                Created_By: systemAgentId,
                Org_Id: orgId
            });
            agent = agentRepository.findById(agentId);
            created += 1;
        } else {
            const currentRole = agent.Role_Id ? roleRepository.findById(agent.Role_Id) : null;
            if (!currentRole || !currentRole.Role_Key) {
                agentRepository.updateById(agent.Agent_Id, {
                    Role_Id: roleId,
                    Primary_Department_Id: teamId,
                    Status: "Active",
                    Modified_By: systemAgentId
                });
                updated += 1;
            }
        }

        if (defaultPassword && !credentialRepository.findByAgentId(agent.Agent_Id)) {
            authService.setPassword(agent.Agent_Id, defaultPassword, { mustChange: true, actorAgentId: systemAgentId });
            credentials += 1;
        }
    }

    logger.info(`Seeded support roster: ${created} created, ${updated} assigned team/role, ${credentials} sign-in credential(s) issued.`);
    if (!defaultPassword) {
        logger.warn("SEED_DEFAULT_PASSWORD is not set - no sign-in credentials were issued. Set it and re-run the seed, or issue passwords from the Admin page.");
    }
};

/**
 * Banks from docs/Vision Support Desk KB.xlsx (seed-data/banks.json): which
 * support team works each bank, its support level/hours, and its primary /
 * secondary resources. Created once by name - a bank already present has
 * been maintained in the app since and is left alone.
 */
const seedBanks = (orgId, systemAgentId, teamIdByName) => {
    let created = 0;
    const missingResources = new Set();

    for (const bank of bankSeed.banks) {
        if (bankRepository.findByName(orgId, bank.name)) continue;

        const departmentId = teamIdByName[bank.team];
        if (!departmentId) {
            throw new Error(`Seed bank "${bank.name}" references unknown support team "${bank.team}"`);
        }

        const bankId = generateId();
        bankRepository.insert({
            Bank_Id: bankId,
            Bank_Name: bank.name,
            Department_Id: departmentId,
            Country: bank.country || null,
            Module: bank.module || null,
            Support_Level: bank.supportLevel || null,
            // SLA calendar: the sheet's support days (MON-FRI when blank; 24x7
            // counts every day) in the country's time zone.
            Working_Days: bank.is24x7 ? "MON,TUE,WED,THU,FRI,SAT,SUN" : (bank.workingDays || "MON,TUE,WED,THU,FRI"),
            Time_Zone: bankSeed.timeZoneByCountry[bank.country] || env.timezone,
            // Support window (IST) that bounds resolution time; the sheet
            // leaves some banks blank - they get the standard 10:30-19:30.
            Support_Start_Ist: bank.supportStartIst || DEFAULT_SUPPORT_START_IST,
            Support_End_Ist: bank.supportEndIst || DEFAULT_SUPPORT_END_IST,
            Is_24x7: bank.is24x7 ? "Y" : "N",
            Remarks: bank.remarks || null,
            Created_By: systemAgentId,
            Org_Id: orgId
        });
        created += 1;

        for (const [type, emails] of [["PRIMARY", bank.primary || []], ["SECONDARY", bank.secondary || []]]) {
            const agentIds = [];
            for (const email of emails) {
                const agent = agentRepository.findByEmail(orgId, email);
                if (agent) agentIds.push(agent.Agent_Id);
                else missingResources.add(email);
            }
            bankRepository.replaceResources(bankId, type, agentIds, { actorAgentId: systemAgentId, orgId });
        }
    }

    logger.info(`Seeded banks: ${created} created.`);
    if (missingResources.size > 0) {
        logger.warn(`Bank resources not found as agents (skipped): ${[...missingResources].join(", ")}`);
    }
};

/**
 * Ticket option lists (seed-data/config.json): statuses (with their
 * resolution-clock behaviour), classifications
 * with their categories, products, priority SLAs and the escalation
 * matrix (levels per priority). Each value is created
 * once; values an admin adds, renames or deletes later on the Config page
 * are not touched.
 */
const seedConfig = (orgId, systemAgentId) => {
    let created = 0;
    const addPicklist = (field, value, sortOrder, parentValue = null, clockBehaviour = null) => {
        if (picklistRepository.findByValue(orgId, field, value, parentValue)) return;
        picklistRepository.insert({
            Picklist_Value_Id: generateId(),
            Field: field,
            Value: value,
            Parent_Value: parentValue,
            Clock_Behaviour: clockBehaviour,
            Sort_Order: sortOrder,
            Created_By: systemAgentId,
            Org_Id: orgId
        });
        created += 1;
    };

    configSeed.statuses.forEach((status, index) => addPicklist("STATUS", status.value, index, null, status.clock));
    configSeed.teamTypes.forEach((teamType, index) => addPicklist("TEAM_TYPE", teamType, index));
    Object.entries(configSeed.classifications).forEach(([classification, categories], index) => {
        addPicklist("CLASSIFICATION", classification, index);
        categories.forEach((category, categoryIndex) => addPicklist("CATEGORY", category, categoryIndex, classification));
    });

    for (const productName of configSeed.products) {
        if (productRepository.findByName(orgId, productName)) continue;
        productRepository.insert({ Product_Id: generateId(), Product_Name: productName, Created_By: systemAgentId, Org_Id: orgId });
        created += 1;
    }

    for (const { priority, slaHours } of configSeed.prioritySla) {
        if (prioritySlaRepository.findByPriority(orgId, priority)) continue;
        prioritySlaRepository.insert({
            Priority_Sla_Config_Id: generateId(),
            Priority: priority,
            Sla_Hours: slaHours,
            Created_By: systemAgentId,
            Org_Id: orgId
        });
        created += 1;
    }

    for (const { priority, levelNo, offsetHours } of configSeed.escalationLevels) {
        if (escalationLevelRepository.findByPriorityAndLevel(orgId, priority, levelNo)) continue;
        escalationLevelRepository.insert({
            Escalation_Level_Id: generateId(),
            Priority: priority,
            Level_No: levelNo,
            Offset_Hours: offsetHours,
            Created_By: systemAgentId,
            Org_Id: orgId
        });
        created += 1;
    }

    logger.info(`Seeded config: ${created} value(s) created.`);
};

if (require.main === module) {
    try {
        seed();
        closeDB();
        process.exit(0);
    } catch (error) {
        logger.error("Seed failed:", error);
        closeDB();
        process.exit(1);
    }
}

module.exports = { seed };
