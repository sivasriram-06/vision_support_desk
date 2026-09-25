// One assignee's work on a ticket - mirrors WORK_STATE in
// server/src/constants/ticket.constants.js. Literal Tailwind classes only.
export const WORK_STATES = {
  PENDING: { label: 'Pending', hint: 'Assigned, not started - waiting for handover', bar: 'bg-slate-300', dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-100' },
  WAITING: { label: 'Waiting', hint: 'Blocked by another assignee’s work', bar: 'bg-amber-400', dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  READY: { label: 'Ready', hint: 'Unblocked, not started yet', bar: 'bg-sky', dot: 'bg-sky', text: 'text-sky-dark', bg: 'bg-sky/10' },
  IN_PROGRESS: { label: 'In progress', hint: 'Being worked on', bar: 'bg-success', dot: 'bg-success', text: 'text-success-dark', bg: 'bg-success/10' },
  ON_HOLD: { label: 'On hold', hint: 'Waiting on the bank or for information', bar: 'bg-review', dot: 'bg-review', text: 'text-review', bg: 'bg-review/10' },
  DONE: { label: 'Done', hint: 'Finished', bar: 'bg-slate-500', dot: 'bg-slate-500', text: 'text-slate-700', bg: 'bg-slate-200' },
}

export const getWorkStyle = (state) => WORK_STATES[state] || WORK_STATES.PENDING

// Ticket status stretches on the swimlane's top row, by clock behaviour.
export const STATUS_BAR = {
  NOT_STARTED: 'bg-sky/60',
  RUNNING: 'bg-primary/70',
  PAUSED: 'bg-warn/70',
  STOPPED: 'bg-success/60',
}

// Timeline event types (server: services/tracking/ticket-tracking.service.js).
export const EVENT_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'ASSIGNMENT', label: 'Assignment', types: ['ASSIGNMENT', 'DEPENDENCY'] },
  { value: 'WORK', label: 'Work state', types: ['WORK'] },
  { value: 'STATUS', label: 'Status', types: ['STATUS', 'PRIORITY', 'FIELD', 'CREATED'] },
  { value: 'COMMENT', label: 'Comments', types: ['COMMENT'] },
  { value: 'EMAIL', label: 'Email', types: ['EMAIL'] },
  { value: 'WORKLOG', label: 'Work log', types: ['WORKLOG'] },
]
