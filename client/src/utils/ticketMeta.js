/**
 * Visual mapping for ticket Status_Type / Priority / Channel values.
 * Mirrors server/src/constants/ticket.constants.js - keep both in sync if
 * the backend's enum values change.
 */

export const STATUS_TYPE_STYLES = {
  Open: { dot: 'bg-sky', text: 'text-sky-dark', bg: 'bg-sky/10', label: 'Open' },
  'On Hold': { dot: 'bg-warn', text: 'text-warn', bg: 'bg-warn/10', label: 'On Hold' },
  Closed: { dot: 'bg-success', text: 'text-success-dark', bg: 'bg-success/10', label: 'Closed' },
}

export const getStatusStyle = (statusType) =>
  STATUS_TYPE_STYLES[statusType] || { dot: 'bg-muted', text: 'text-muted', bg: 'bg-muted/10', label: statusType || '-' }

export const PRIORITY_STYLES = {
  P1: { text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/25', label: 'P1 · Urgent' },
  P2: { text: 'text-warn', bg: 'bg-warn/10', border: 'border-warn/25', label: 'P2 · High' },
  P3: { text: 'text-sky-dark', bg: 'bg-sky/10', border: 'border-sky/25', label: 'P3 · Normal' },
  P4: { text: 'text-muted', bg: 'bg-muted/10', border: 'border-muted/25', label: 'P4 · Low' },
}

export const getPriorityStyle = (priority) =>
  PRIORITY_STYLES[priority] || { text: 'text-muted', bg: 'bg-muted/10', border: 'border-border', label: 'Unset' }

export const CHANNEL_LABELS = {
  Email: 'Email',
  'Web Form': 'Web Form',
  Social: 'Social',
  Chat: 'Chat',
  Phone: 'Phone',
}

/** Deterministic color for an avatar/dot from a name or id string. */
const AVATAR_PALETTE = ['#E8632B', '#2AABE2', '#22C55E', '#A855F7', '#E0912B', '#0C4A6E', '#EF4444']
export const getAvatarColor = (seed) => {
  if (!seed) return AVATAR_PALETTE[0]
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}
