// Mirrors server/src/constants/permissions.js. The server is the authority
// (it re-checks every request); these keys only decide what the UI shows.
export const PERMISSIONS = {
  TICKETS_VIEW: 'tickets.view',
  TICKETS_CREATE: 'tickets.create',
  TICKETS_REPLY: 'tickets.reply',
  TICKETS_EDIT_STATUS: 'tickets.edit_status',
  TICKETS_EDIT_PROPERTIES: 'tickets.edit_properties',
  TICKETS_ASSIGN_TEAM: 'tickets.assign_team',
  TICKETS_ASSIGN_ANY: 'tickets.assign_any',
  AGENTS_MANAGE: 'agents.manage',
  TEAMS_MANAGE: 'teams.manage',
  CONFIG_MANAGE: 'config.manage',
  ADMIN_ACCESS: 'admin.access',
}

export const ROLE_KEYS = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  TEAM_LEAD: 'TEAM_LEAD',
  ASSISTANT_TEAM_LEAD: 'ASSISTANT_TEAM_LEAD',
  TEAM_MEMBER: 'TEAM_MEMBER',
}

// Badge colors per role, used on the Agents and Admin pages.
export const ROLE_STYLE = {
  ADMIN: { text: 'text-white', bg: 'bg-navy' },
  MANAGER: { text: 'text-primary-dark', bg: 'bg-primary/12' },
  TEAM_LEAD: { text: 'text-sky-dark', bg: 'bg-sky/12' },
  ASSISTANT_TEAM_LEAD: { text: 'text-review', bg: 'bg-review/10' },
  TEAM_MEMBER: { text: 'text-slate-600', bg: 'bg-slate-100' },
}
