export const STATUS_TYPE_STYLES = {
  Open: { dot: 'bg-sky', text: 'text-sky-dark', bg: 'bg-sky/10', label: 'Open' },
  'On Hold': { dot: 'bg-warn', text: 'text-warn', bg: 'bg-warn/10', label: 'On Hold' },
  Closed: { dot: 'bg-success', text: 'text-success-dark', bg: 'bg-success/10', label: 'Closed' },
}

export const getStatusStyle = (statusType) =>
  STATUS_TYPE_STYLES[statusType] || { dot: 'bg-muted', text: 'text-muted', bg: 'bg-muted/10', label: statusType || '-' }

// Priorities are admin-managed: well-known keys get pinned colours, others a hashed one from PRIORITY_PALETTE.
const PRIORITY_STYLES = {
  P1: { text: 'text-danger', dot: 'bg-danger', bg: 'bg-danger/10', border: 'border-danger/25' },
  P2: { text: 'text-warn', dot: 'bg-warn', bg: 'bg-warn/10', border: 'border-warn/25' },
  P3: { text: 'text-sky-dark', dot: 'bg-sky', bg: 'bg-sky/10', border: 'border-sky/25' },
  P4: { text: 'text-muted', dot: 'bg-muted', bg: 'bg-muted/10', border: 'border-muted/25' },
}

const PRIORITY_PALETTE = [
  { text: 'text-danger', dot: 'bg-danger', bg: 'bg-danger/10', border: 'border-danger/25' },
  { text: 'text-warn', dot: 'bg-warn', bg: 'bg-warn/10', border: 'border-warn/25' },
  { text: 'text-sky-dark', dot: 'bg-sky', bg: 'bg-sky/10', border: 'border-sky/25' },
  { text: 'text-success-dark', dot: 'bg-success', bg: 'bg-success/10', border: 'border-success/25' },
  { text: 'text-primary', dot: 'bg-primary', bg: 'bg-primary/10', border: 'border-primary/25' },
  { text: 'text-muted', dot: 'bg-muted', bg: 'bg-muted/10', border: 'border-muted/25' },
]

export const getPriorityStyle = (priority) => {
  if (!priority) return { text: 'text-muted', dot: 'bg-muted', bg: 'bg-muted/10', border: 'border-border', label: 'Unset' }
  if (PRIORITY_STYLES[priority]) return { ...PRIORITY_STYLES[priority], label: priority }
  let hash = 0
  for (let i = 0; i < priority.length; i += 1) hash = (hash * 31 + priority.charCodeAt(i)) >>> 0
  return { ...PRIORITY_PALETTE[hash % PRIORITY_PALETTE.length], label: priority }
}

export const CHANNEL_LABELS = {
  Email: 'Email',
  'Web Form': 'Web Form',
  Social: 'Social',
  Chat: 'Chat',
  Phone: 'Phone',
}


// Ageing buckets in weeks as in the support team's reports; each covers ages below `underDays`.
const AGEING_BUCKETS = [
  { underDays: 7, label: '0-1 WK' },
  { underDays: 14, label: '1-2 WK' },
  { underDays: 28, label: '2-4 WK' },
  { underDays: 70, label: '4-10 WK' },
  { underDays: Infinity, label: '10+ WK' },
]

export const getTicketAgeDays = (ticket) => {
  if (ticket.Status_Type === 'Closed') return null
  const createdMs = new Date(ticket.Created_Time).getTime()
  if (Number.isNaN(createdMs)) return null
  return Math.max(0, Math.floor((Date.now() - createdMs) / 86400000))
}

export const getAgeingBucketLabel = (ageDays) => {
  if (ageDays === null || ageDays === undefined) return null
  return AGEING_BUCKETS.find((bucket) => ageDays < bucket.underDays)?.label || null
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

/** Display name of an entry in ticket.Assignees. */
export const assigneeName = (a) => [a.firstName, a.lastName].filter(Boolean).join(' ')
