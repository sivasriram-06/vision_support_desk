import { useEffect, useMemo, useState } from 'react'
import { Layers, Flag, ListChecks } from 'lucide-react'
import Select from '../ui/Select.jsx'
import ErrorState from '../ui/ErrorState.jsx'
import { QueueColumn } from './QueueTicketCard.jsx'
import useFitHeight from '../../utils/useFitHeight.js'
import { getPriorityStyle } from '../../utils/ticketMeta.js'
import { getClockStyle, getSlaState } from '../../utils/clockMeta.js'
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

  const [boardRef, boardHeight] = useFitHeight(state.loading)

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
