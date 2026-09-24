// Resolution-clock behaviour per status - mirrors CLOCK_BEHAVIOUR in
// server/src/constants/ticket.constants.js. Set per status on the Config
// page; drives the status badge colour and the ticket's Resolution block.
export const CLOCK_BEHAVIOURS = [
  { value: 'NOT_STARTED', label: 'Not started', hint: 'Work not begun (e.g. Unassigned, Open)' },
  { value: 'RUNNING', label: 'Running', hint: 'Our side is working (e.g. In Progress)' },
  { value: 'PAUSED', label: 'Paused', hint: 'Waiting on the bank (e.g. On Hold - Client)' },
  { value: 'STOPPED', label: 'Stopped', hint: 'Resolved or closed' },
]

const CLOCK_STYLE = {
  NOT_STARTED: { dot: 'bg-sky', text: 'text-sky-dark', bg: 'bg-sky/10' },
  RUNNING: { dot: 'bg-primary', text: 'text-primary-dark', bg: 'bg-primary/10' },
  PAUSED: { dot: 'bg-warn', text: 'text-warn', bg: 'bg-warn/10' },
  STOPPED: { dot: 'bg-success', text: 'text-success-dark', bg: 'bg-success/10' },
}

export const getClockStyle = (clockState) => CLOCK_STYLE[clockState] || CLOCK_STYLE.NOT_STARTED
export const getClockLabel = (clockState) => CLOCK_BEHAVIOURS.find((c) => c.value === clockState)?.label || 'Not started'

/** "2d 3h", "3h 20m", "45m" - for resolution time and SLA countdowns. */
export const formatMinutes = (totalMinutes) => {
  const mins = Math.max(0, Math.round(totalMinutes))
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const minutes = mins % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/** SLA state for a ticket: null when no SLA, else { overdue, minutesLeft | minutesOver }. */
export const getSlaState = (ticket, now = new Date()) => {
  if (!ticket?.Response_Due_Date) return null
  const due = new Date(ticket.Response_Due_Date)
  // A resolved/closed ticket is judged at the moment it was resolved.
  const reference = ticket.Clock_State === 'STOPPED' && ticket.Resolved_Time ? new Date(ticket.Resolved_Time) : now
  const diffMinutes = (due - reference) / 60000
  return {
    due,
    stopped: ticket.Clock_State === 'STOPPED',
    overdue: diffMinutes < 0,
    minutes: Math.abs(diffMinutes),
  }
}
