/**
 * Permission catalogue + the built-in roles. Roles live in HD_ROLE_MASTER
 * (keyed by Role_Key); each role's permission set is admin-editable from the
 * Admin page and stored in HD_ROLE_MASTER.Permissions_Json. The defaults
 * below are only what seed.js writes the first time a role is created -
 * re-seeding never overwrites an admin's later changes.
 */
const PERMISSIONS = {
    TICKETS_VIEW: "tickets.view",
    TICKETS_CREATE: "tickets.create",
    TICKETS_REPLY: "tickets.reply",
    TICKETS_EDIT_STATUS: "tickets.edit_status",
    TICKETS_EDIT_PROPERTIES: "tickets.edit_properties",
    TICKETS_ASSIGN_TEAM: "tickets.assign_team",
    TICKETS_ASSIGN_ANY: "tickets.assign_any",
    AGENTS_MANAGE: "agents.manage",
    TEAMS_MANAGE: "teams.manage",
    CONFIG_MANAGE: "config.manage",
    ADMIN_ACCESS: "admin.access"
};

const PERMISSION_CATALOG = [
    { key: PERMISSIONS.TICKETS_VIEW, group: "Tickets", label: "View tickets", description: "See the case list and open ticket details." },
    { key: PERMISSIONS.TICKETS_CREATE, group: "Tickets", label: "Create tickets", description: "Log a new ticket manually." },
    { key: PERMISSIONS.TICKETS_REPLY, group: "Tickets", label: "Reply & comment", description: "Add replies and internal comments on a ticket." },
    { key: PERMISSIONS.TICKETS_EDIT_STATUS, group: "Tickets", label: "Edit status", description: "Change a ticket's status." },
    { key: PERMISSIONS.TICKETS_EDIT_PROPERTIES, group: "Tickets", label: "Edit properties", description: "Change bank, priority, department, product, classification, category and due date." },
    { key: PERMISSIONS.TICKETS_ASSIGN_TEAM, group: "Assignment", label: "Assign within own team", description: "Assign tickets to members of their own team." },
    { key: PERMISSIONS.TICKETS_ASSIGN_ANY, group: "Assignment", label: "Assign to anyone", description: "Assign tickets to any agent in any team." },
    { key: PERMISSIONS.AGENTS_MANAGE, group: "Administration", label: "Manage agents", description: "Add, edit and deactivate agents and move them between teams." },
    { key: PERMISSIONS.TEAMS_MANAGE, group: "Administration", label: "Manage banks & teams", description: "Add and edit banks (support team, level, hours, primary / secondary resources) and support teams." },
    { key: PERMISSIONS.CONFIG_MANAGE, group: "Administration", label: "Manage config", description: "Edit priorities/SLA, statuses, classifications and products." },
    { key: PERMISSIONS.ADMIN_ACCESS, group: "Administration", label: "Admin controller", description: "Open the Admin page: role permissions, user access, passwords, mail integration." }
];

const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);

const ROLE_KEYS = {
    ADMIN: "ADMIN",
    MANAGER: "MANAGER",
    TEAM_LEAD: "TEAM_LEAD",
    ASSISTANT_TEAM_LEAD: "ASSISTANT_TEAM_LEAD",
    TEAM_MEMBER: "TEAM_MEMBER"
};

const MEMBER_PERMISSIONS = [
    PERMISSIONS.TICKETS_VIEW,
    PERMISSIONS.TICKETS_REPLY,
    PERMISSIONS.TICKETS_EDIT_STATUS
];

const DEFAULT_ROLES = [
    { key: ROLE_KEYS.ADMIN, name: "Admin", sortOrder: 1, parentKey: null, permissions: ALL_PERMISSION_KEYS },
    { key: ROLE_KEYS.MANAGER, name: "Manager", sortOrder: 2, parentKey: ROLE_KEYS.ADMIN, permissions: ALL_PERMISSION_KEYS },
    {
        key: ROLE_KEYS.TEAM_LEAD,
        name: "Team Lead",
        sortOrder: 3,
        parentKey: ROLE_KEYS.MANAGER,
        permissions: [...MEMBER_PERMISSIONS, PERMISSIONS.TICKETS_CREATE, PERMISSIONS.TICKETS_EDIT_PROPERTIES, PERMISSIONS.TICKETS_ASSIGN_TEAM]
    },
    {
        key: ROLE_KEYS.ASSISTANT_TEAM_LEAD,
        name: "Assistant Team Lead",
        sortOrder: 4,
        parentKey: ROLE_KEYS.TEAM_LEAD,
        // Team Lead and Assistant Team Lead both pick up new tickets and assign them within the team.
        permissions: [...MEMBER_PERMISSIONS, PERMISSIONS.TICKETS_CREATE, PERMISSIONS.TICKETS_EDIT_PROPERTIES, PERMISSIONS.TICKETS_ASSIGN_TEAM]
    },
    { key: ROLE_KEYS.TEAM_MEMBER, name: "Team Member", sortOrder: 5, parentKey: ROLE_KEYS.ASSISTANT_TEAM_LEAD, permissions: MEMBER_PERMISSIONS }
];

module.exports = { PERMISSIONS, PERMISSION_CATALOG, ALL_PERMISSION_KEYS, ROLE_KEYS, DEFAULT_ROLES };
