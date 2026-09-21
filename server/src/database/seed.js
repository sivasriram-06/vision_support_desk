const env = require("../config/env");
const { connectDB, closeDB } = require("../config/db");
const generateId = require("../utils/generate-id");
const logger = require("../utils/logger");
const organizationRepository = require("../repositories/organization.repository");
const departmentRepository = require("../repositories/department.repository");
const agentRepository = require("../repositories/agent.repository");
const { channel: channelRepository, mailReplyAddress: mailReplyAddressRepository } = require("../repositories/channel.repository");
const { SYSTEM_AGENT_EMAIL } = require("../services/organization.service");

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

    logger.info("Seed complete.");
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
