require("./env");
const jwt = require("jsonwebtoken");
const env = require("../../src/config/env");
const { getDB } = require("../../src/config/db");
const authService = require("../../src/services/auth.service");
const contactService = require("../../src/services/contact.service");
const ticketService = require("../../src/services/ticket.service");
const organizationService = require("../../src/services/organization.service");

/** Password every test sign-in gets (meets the password policy). */
const TEST_PASSWORD = "VsdTest@2026";

const systemAgentId = () => organizationService.getSystemAgent().Agent_Id;
const orgId = () => organizationService.getDefaultOrganization().Organization_Id;

// An active seeded agent with the given role key, optionally in/not in a team and excluding used ids.
const agentWithRole = (roleKey, { departmentId = null, notDepartmentId = null, exclude = [] } = {}) => {
    const rows = getDB().prepare(
        `SELECT a.*, r.Role_Key FROM HD_AGENT_MASTER a
         JOIN HD_ROLE_MASTER r ON r.Role_Id = a.Role_Id
         WHERE r.Role_Key = ? AND a.Is_Deleted = 'N' AND a.Status = 'Active'
         ORDER BY a.Agent_Id`
    ).all(roleKey);
    const found = rows.find((a) =>
        (!departmentId || a.Primary_Department_Id === departmentId)
        && (!notDepartmentId || a.Primary_Department_Id !== notDepartmentId)
        && !exclude.includes(a.Agent_Id));
    if (!found) throw new Error(`No seeded ${roleKey} agent${departmentId ? ` in team ${departmentId}` : ""}`);
    return found;
};

/** Gives the agent a sign-in (no "must change" flag) and returns a Bearer token. */
const signIn = (agent) => {
    authService.setPassword(agent.Agent_Id, TEST_PASSWORD, { mustChange: false, actorAgentId: systemAgentId() });
    return jwt.sign({ sub: agent.Agent_Id }, env.jwtSecret, { expiresIn: "10m" });
};

/** A seeded support team that has at least one bank and agents with the roles tests need. */
const supportTeam = () => getDB().prepare(
    `SELECT d.* FROM HD_DEPARTMENT_MASTER d
     WHERE d.Is_Deleted = 'N'
       AND EXISTS (SELECT 1 FROM HD_BANK_MASTER b WHERE b.Department_Id = d.Department_Id AND b.Is_Deleted = 'N')
       AND EXISTS (SELECT 1 FROM HD_AGENT_MASTER a JOIN HD_ROLE_MASTER r ON r.Role_Id = a.Role_Id
                   WHERE a.Primary_Department_Id = d.Department_Id AND r.Role_Key = 'TEAM_LEAD' AND a.Is_Deleted = 'N')
       AND EXISTS (SELECT 1 FROM HD_AGENT_MASTER a JOIN HD_ROLE_MASTER r ON r.Role_Id = a.Role_Id
                   WHERE a.Primary_Department_Id = d.Department_Id AND r.Role_Key = 'TEAM_MEMBER' AND a.Is_Deleted = 'N')
     ORDER BY d.Department_Id LIMIT 1`
).get();

/** A bank of the given team (Mon-Fri, not 24x7 when one exists). */
const bankOf = (departmentId, { is24x7 = null } = {}) => getDB().prepare(
    `SELECT * FROM HD_BANK_MASTER WHERE Department_Id = ? AND Is_Deleted = 'N' ${is24x7 ? "AND Is_24x7 = ?" : ""} ORDER BY Bank_Id LIMIT 1`
).get(...[departmentId, is24x7].filter(Boolean));

let contactCounter = 0;
const createContact = (overrides = {}) => {
    contactCounter += 1;
    return contactService.createContact({
        firstName: "Test",
        lastName: `Customer ${contactCounter}`,
        email: `customer${contactCounter}.${process.pid}@bank.test`,
        ...overrides
    }, systemAgentId());
};

/** A ticket through the real service (SLA, history, metrics). Defaults: Email, P2, a seeded team + bank. */
const createTicket = (overrides = {}) => {
    const team = overrides.departmentId ? { Department_Id: overrides.departmentId } : supportTeam();
    const bank = overrides.bankId === undefined ? bankOf(team.Department_Id) : null;
    const contactId = overrides.contactId || createContact().Contact_Id;
    return ticketService.createTicket({
        subject: "Test ticket",
        channel: "Email",
        departmentId: team.Department_Id,
        bankId: bank ? bank.Bank_Id : null,
        contactId,
        priority: "P2",
        ...overrides
    }, systemAgentId());
};

module.exports = { TEST_PASSWORD, systemAgentId, orgId, agentWithRole, signIn, supportTeam, bankOf, createContact, createTicket };
