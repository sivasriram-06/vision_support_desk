import { useEffect, useMemo, useState } from 'react'
import { UsersRound, Landmark, Flag } from 'lucide-react'
import PageTitle from '../components/ui/PageTitle.jsx'
import Select from '../components/ui/Select.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
import { QueueColumn } from '../components/tickets/QueueTicketCard.jsx'
import useFitHeight from '../utils/useFitHeight.js'
import { getEscalationStyle, describeEscalationOffset } from '../utils/clockMeta.js'
import {
  ApiError,
  getEscalatedTickets,
  getEscalationLevels,
  getDepartments,
  getBanks,
  getPrioritySlaConfig,
} from '../utils/api.js'

const EMPTY_FILTERS = { departmentId: '', bankId: '', priority: '' }

/**
 * Escalations queue: every open ticket that has reached an escalation
 * level, one column per level (Config page -> Escalation matrix). Level N
 * of a priority falls due a set number of hours before/after the SLA due
 * date; resolving or closing a ticket takes it off this board.
 */
export default function EscalationsPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [lookups, setLookups] = useState({ teams: [], banks: [], priorities: [], levels: [] })
  const [state, setState] = useState({ loading: true, error: null, tickets: [] })
  const [reloadKey, setReloadKey] = useState(0)
  const [boardRef, boardHeight] = useFitHeight(state.loading)

  useEffect(() => {
    Promise.all([getDepartments(), getBanks(), getPrioritySlaConfig(), getEscalationLevels()])
      .then(([teamsRes, banksRes, priorityRes, levelsRes]) =>
        setLookups({ teams: teamsRes.data, banks: banksRes.data, priorities: priorityRes.data, levels: levelsRes.data }),
      )
      .catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    getEscalatedTickets(params)
      .then((res) => !cancelled && setState({ loading: false, error: null, tickets: res.data }))
      .catch((err) => !cancelled && setState({ loading: false, error: err instanceof ApiError ? err.message : 'Failed to load escalations.', tickets: [] }))
    return () => {
      cancelled = true
    }
  }, [filters, reloadKey])

  // Banks narrow to the picked support team.
  const bankOptions = lookups.banks
    .filter((b) => !filters.departmentId || b.Department_Id === filters.departmentId)
    .map((b) => ({ value: b.Bank_Id, label: b.Bank_Name }))

  // One column per configured level number (across priorities), plus any
  // level a ticket still sits at after its level was deleted.
  const columns = useMemo(() => {
    const levelNos = new Set(lookups.levels.map((l) => l.Level_No))
    state.tickets.forEach((t) => levelNos.add(t.Escalation_Level))
    return [...levelNos]
      .sort((a, b) => a - b)
      .map((levelNo) => {
        const rules = lookups.levels
          .filter((l) => l.Level_No === levelNo && (!filters.priority || l.Priority === filters.priority))
          .map((l) => `${l.Priority}: ${describeEscalationOffset(l.Offset_Hours)}`)
        return {
          levelNo,
          hint: rules.join(' · '),
          tickets: state.tickets.filter((t) => t.Escalation_Level === levelNo),
          accentClass: getEscalationStyle(levelNo).dot,
        }
      })
  }, [lookups.levels, state.tickets, filters.priority])

  const set = (patch) => setFilters((prev) => ({ ...prev, ...patch }))

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title="Escalations"
        subtitle="Open tickets nearing or past their SLA due date, by escalation level"
        count={state.loading ? undefined : state.tickets.length}
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-primary" />
          <Select
            value={filters.departmentId}
            onChange={(e) => set({ departmentId: e.target.value, bankId: '' })}
            options={lookups.teams.map((d) => ({ value: d.Department_Id, label: d.Department_Name }))}
            placeholder="All support teams"
            className="w-56"
          />
        </div>
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary" />
          <Select value={filters.bankId} onChange={(e) => set({ bankId: e.target.value })} options={bankOptions} placeholder="All banks" className="w-56" />
        </div>
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-primary" />
          <Select
            value={filters.priority}
            onChange={(e) => set({ priority: e.target.value })}
            options={lookups.priorities.map((p) => ({ value: p.Priority, label: p.Priority }))}
            placeholder="All priorities"
            className="w-40"
          />
        </div>
        {!state.loading && columns.length > 0 && (
          <p className="text-[12.5px] text-muted">
            {columns
              .filter((c) => c.tickets.length > 0)
              .map((c) => `${c.tickets.length} at L${c.levelNo}`)
              .join(' · ') || 'Nothing escalated'}
          </p>
        )}
      </div>

      {state.error ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-card">
          <ErrorState message={state.error} onRetry={() => setReloadKey((k) => k + 1)} />
        </div>
      ) : state.loading ? (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[320px] w-[300px] shrink-0 animate-pulse rounded-2xl bg-slate-200/60" />
          ))}
        </div>
      ) : columns.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white px-6 py-12 text-center text-[13px] text-muted shadow-card">
          No escalation levels configured yet. Add them on the Config page under Escalation matrix.
        </div>
      ) : (
        <div ref={boardRef} style={{ height: boardHeight }} className="flex gap-4 overflow-x-auto pb-2" aria-label="Escalation queue">
          {columns.map((col) => (
            <QueueColumn
              key={col.levelNo}
              title={`Level ${col.levelNo}`}
              subtitle={col.hint}
              tickets={col.tickets}
              mode="escalation"
              accentClass={col.accentClass}
              emptyText="Nothing at this level"
            />
          ))}
        </div>
      )}
    </div>
  )
}