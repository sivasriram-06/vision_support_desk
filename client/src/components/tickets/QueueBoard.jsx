import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox, Hourglass, Layers, Flag, ListChecks, Tag } from 'lucide-react'
import Select from '../ui/Select.jsx'
import Badge from '../ui/Badge.jsx'
import Avatar from '../ui/Avatar.jsx'
import ErrorState from '../ui/ErrorState.jsx'
import { getPriorityStyle } from '../../utils/ticketMeta.js'
import { getClockStyle, getSlaState, formatMinutes } from '../../utils/clockMeta.js'
import { formatDateTime } from '../../utils/format.js'
import { ApiError, getTickets, getDepartments, getBanks, getPicklistValues, getPrioritySlaConfig } from '../../utils/api.js'

const MODE_STORAGE_KEY = 'vsd:queue-mode'
const MODES = [
  { value: 'priority', label: 'Priority Mode', icon: Flag },
  { value: 'status', label: 'Status Mode', icon: ListChecks },
]
const NO_PRIORITY = 'No Priority'
const OTHER_STATUS = 'Other Status'

const readStoredMode = () => {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === 'status' ? 'status' : 'priority'
  } catch {
    return 'priority'
  }
}

const fullName = (first, last) => [first, last].filter(Boolean).join(' ')

// The list endpoint pages at 100; a queue board needs every ticket in the
// queue, so walk the pages.
const fetchAllTickets = async (params) => {
  const all = []
  for (let page = 1; page <= 50; page += 1) {
    const res = await getTickets({ ...params, page, limit: 100, sortBy: 'Created_Time', sortOrder: 'desc' })
    all.push(...res.data)
    if (!res.paging?.hasMore) break
  }
  return all
}

function QueueCard({ ticket, mode }) {
  const navigate = useNavigate()
  const sla = getSlaState(ticket)
  const status = getClockStyle(ticket.Clock_State)
  const priority = getPriorityStyle(ticket.Priority)
  const contact = fullName(ticket.Contact_First_Name, ticket.Contact_Last_Name) || 'Unknown contact'
  const assignee = fullName(ticket.Assignee_First_Name, ticket.Assignee_Last_Name)

  return (
    <button
      onClick={() => navigate(`/tickets/${ticket.Ticket_Id}`)}
      className="group flex w-full cursor-pointer flex-col gap-2.5 rounded-xl border border-slate-200/90 bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition hover:-translate-y-px hover:border-primary/40 hover:shadow-card"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-[13px] font-bold leading-snug text-ink group-hover:text-primary-dark">{ticket.Subject}</p>
        {assignee ? (
          <Avatar name={assignee} size={26} />
        ) : (
          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">Unassigned</span>
        )}
      </div>

      <p className="truncate text-[12px] text-muted">
        <span className="font-mono font-semibold text-slate-500">#{ticket.Ticket_Number}</span>
        <span className="mx-1.5">·</span>
        {contact}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {/* Priority mode groups by priority, so the card shows status - and vice versa. */}
        {mode === 'priority' ? (
          <Badge dotClass={status.dot} textClass={status.text} bgClass={status.bg}>
            {ticket.Status || '-'}
          </Badge>
        ) : ticket.Priority ? (
          <Badge textClass={priority.text} bgClass={priority.bg} className={`border ${priority.border}`}>
            {ticket.Priority}
          </Badge>
        ) : null}
        {ticket.Classification && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            <Tag className="h-3 w-3" />
            {ticket.Classification}
            {ticket.Category && <span className="font-normal text-muted">/ {ticket.Category}</span>}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[#EEF2F8] pt-2 text-[11.5px]">
        {sla ? (
          <span className={`inline-flex items-center gap-1 font-semibold ${sla.overdue ? 'text-danger' : 'text-slate-500'}`}>
            <Hourglass className="h-3 w-3" />
            {sla.stopped ? (sla.overdue ? 'SLA breached' : 'SLA met') : sla.overdue ? `Overdue ${formatMinutes(sla.minutes)}` : `${formatMinutes(sla.minutes)} left`}
          </span>
        ) : (
          <span className="text-muted">No SLA</span>
        )}
        <span className="text-muted">{formatDateTime(ticket.Created_Time)}</span>
      </div>
    </button>
  )
}

function QueueColumn({ title, tickets, mode, accentClass }) {
  return (
    <div className="flex h-full w-[300px] shrink-0 flex-col rounded-2xl border border-slate-200/80 bg-[#EEF2F8]/70">
      <div className="flex items-center gap-2 px-3.5 py-3">
        <span className={`h-2 w-2 rounded-full ${accentClass}`} />
        <p className="truncate text-[12px] font-bold uppercase tracking-wider text-navy">{title}</p>
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-500 shadow-sm">
          {tickets.length}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-3">
        {tickets.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
            <Inbox className="h-6 w-6 text-slate-300" />
            <p className="text-[12px] text-muted">No tickets in this queue</p>
          </div>
        ) : (
          tickets.map((t) => <QueueCard key={t.Ticket_Id} ticket={t} mode={mode} />)
        )}
      </div>
    </div>
  )
}

/**
 * Team Queue / Bank Queue: every ticket for one support team or one bank,
 * as columns grouped by priority or by status (the admin-managed lists
 * from the Config page, in their configured order).
 */
export default function QueueBoard({ view, selectedId, onSelect }) {
  const [mode, setMode] = useState(readStoredMode)
  const [scopes, setScopes] = useState({ teams: [], banks: [] })
  const [columnsConfig, setColumnsConfig] = useState({ statuses: [], priorities: [] })
  const [state, setState] = useState({ loading: true, error: null, tickets: [] })
  const isTeam = view === 'team'

  // The board fills the window down to the bottom edge (columns scroll
  // inside) instead of a fixed guess that leaves a gap on tall screens.
  const boardRef = useRef(null)
  const [boardHeight, setBoardHeight] = useState(480)
  useLayoutEffect(() => {
    const fit = () => {
      if (!boardRef.current) return
      const bottomGap = 28 // matches the page's bottom padding
      setBoardHeight(Math.max(320, window.innerHeight - boardRef.current.getBoundingClientRect().top - bottomGap))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [state.loading])

  useEffect(() => {
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode)
    } catch {
      // per-viewer convenience only
    }
  }, [mode])

  useEffect(() => {
    Promise.all([getDepartments(), getBanks(), getPicklistValues('STATUS'), getPrioritySlaConfig()])
      .then(([teamsRes, banksRes, statusRes, priorityRes]) => {
        setScopes({ teams: teamsRes.data, banks: banksRes.data })
        setColumnsConfig({ statuses: statusRes.data, priorities: priorityRes.data })
      })
      .catch(() => {})
  }, [])

  // No selection = the whole desk ("All support teams" / "All banks").
  const options = isTeam
    ? scopes.teams.map((d) => ({ value: d.Department_Id, label: d.Department_Name }))
    : scopes.banks.map((b) => ({ value: b.Bank_Id, label: b.Support_Team_Name ? `${b.Bank_Name} — ${b.Support_Team_Name}` : b.Bank_Name }))
  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))
    const scope = selectedId ? (isTeam ? { departmentId: selectedId } : { bankId: selectedId }) : {}
    fetchAllTickets(scope)
      // "All banks" means tickets that have a bank; not-yet-routed intake mail
      // only shows under "All support teams".
      .then((tickets) => !cancelled && setState({ loading: false, error: null, tickets: !selectedId && !isTeam ? tickets.filter((t) => t.Bank_Id) : tickets }))
      .catch((err) => !cancelled && setState({ loading: false, error: err instanceof ApiError ? err.message : 'Failed to load queue.', tickets: [] }))
    return () => {
      cancelled = true
    }
  }, [selectedId, isTeam])

  const columns = useMemo(() => {
    const groups = new Map()
    const keys =
      mode === 'priority'
        ? [...columnsConfig.priorities.map((p) => p.Priority), NO_PRIORITY]
        : [...columnsConfig.statuses.map((s) => s.Value), OTHER_STATUS]
    keys.forEach((k) => groups.set(k, []))
    for (const t of state.tickets) {
      const key = mode === 'priority' ? t.Priority || NO_PRIORITY : t.Status
      const bucket = groups.has(key) ? key : mode === 'priority' ? NO_PRIORITY : OTHER_STATUS
      groups.get(bucket).push(t)
    }
    // Hide the catch-all column when nothing falls into it.
    return [...groups.entries()]
      .filter(([key, list]) => list.length > 0 || (key !== NO_PRIORITY && key !== OTHER_STATUS))
      .map(([key, list]) => {
        const statusRow = columnsConfig.statuses.find((s) => s.Value === key)
        const accentClass =
          mode === 'status' ? getClockStyle(statusRow?.Clock_Behaviour).dot : key === NO_PRIORITY ? 'bg-slate-300' : getPriorityStyle(key).dot
        return { key, tickets: list, accentClass }
      })
  }, [mode, columnsConfig, state.tickets])

  const scopeName = options.find((o) => o.value === selectedId)?.label
  // Breached = open past due, or resolved/closed after due (getSlaState
  // judges a stopped ticket at its Resolved_Time).
  const breached = state.tickets.filter((t) => getSlaState(t)?.overdue).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <Select
            value={selectedId || ''}
            onChange={(e) => onSelect(e.target.value)}
            options={options}
            placeholder={isTeam ? 'All support teams' : 'All banks'}
            className="w-72"
          />
        </div>
        {!state.loading && (
          <p className="text-[12.5px] text-muted">
            <strong className="text-ink">{state.tickets.length}</strong> ticket{state.tickets.length === 1 ? '' : 's'}
            {breached > 0 && (
              <>
                {' · '}
                <strong className="text-danger">{breached} SLA breached</strong>
              </>
            )}
          </p>
        )}

        <div className="ml-auto flex gap-1 rounded-xl border border-slate-200/90 bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {MODES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${
                mode === value ? 'bg-navy text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-ink'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {state.error ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-card">
          <ErrorState message={state.error} onRetry={() => onSelect(selectedId)} />
        </div>
      ) : state.loading ? (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[320px] w-[300px] shrink-0 animate-pulse rounded-2xl bg-slate-200/60" />
          ))}
        </div>
      ) : (
        <div
          ref={boardRef}
          style={{ height: boardHeight }}
          className="flex gap-4 overflow-x-auto pb-2"
          aria-label={scopeName ? `${scopeName} queue` : 'Queue'}
        >
          {columns.map((col) => (
            <QueueColumn key={col.key} title={col.key} tickets={col.tickets} mode={mode} accentClass={col.accentClass} />
          ))}
        </div>
      )}
    </div>
  )
}
