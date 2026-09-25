import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { UserCheck, Send, UsersRound } from 'lucide-react'
import PageTitle from '../components/ui/PageTitle.jsx'
import Badge from '../components/ui/Badge.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
import SkeletonRows from '../components/ui/SkeletonRows.jsx'
import AssigneeStack from '../components/tickets/AssigneeStack.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { PERMISSIONS } from '../auth/permissions.js'
import { getPriorityStyle } from '../utils/ticketMeta.js'
import { getClockStyle, getSlaState, formatMinutes, getEscalationStyle } from '../utils/clockMeta.js'
import { formatDateTime } from '../utils/format.js'
import { ApiError, getMyTickets, getMyTicketCounts } from '../utils/api.js'

const TABS = [
  { value: 'assigned', label: 'Assigned to me', icon: UserCheck, countKey: 'assigned' },
  { value: 'assignedBy', label: 'Assigned by me', icon: Send, countKey: 'assignedBy' },
  { value: 'team', label: 'My team', icon: UsersRound, countKey: 'team', leadOnly: true },
]

const COLUMNS = [
  { label: 'Ticket', width: '8%' },
  { label: 'Subject', width: '27%' },
  { label: 'Status', width: '12%' },
  { label: 'Priority', width: '7%' },
  { label: 'SLA Due', width: '12%' },
  { label: 'Bank', width: '11%' },
  { label: 'Assignees', width: '11%' },
  { label: 'Assigned', width: '12%' },
]

function Row({ ticket, scope }) {
  const navigate = useNavigate()
  const status = getClockStyle(ticket.Clock_State)
  const priority = getPriorityStyle(ticket.Priority)
  const sla = getSlaState(ticket)
  const escalation = ticket.Escalation_Level > 0 ? getEscalationStyle(ticket.Escalation_Level) : null
  const isNew = scope === 'assigned' && ticket.My_Is_New === 1

  return (
    <tr
      onClick={() => navigate(`/tickets/${ticket.Ticket_Id}`)}
      className={`cursor-pointer transition-colors hover:bg-[#EBF3FE] ${isNew ? 'bg-primary/[0.04]' : 'even:bg-[#F8FAFD]'}`}
    >
      <td className="whitespace-nowrap px-3.5 py-3 font-mono text-[12px] font-semibold text-slate-500">#{ticket.Ticket_Number}</td>
      <td className="px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {isNew && <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">New</span>}
          <span className={`truncate text-[13px] text-ink ${isNew ? 'font-bold' : 'font-semibold'}`}>{ticket.Subject}</span>
        </div>
      </td>
      <td className="overflow-hidden px-3.5 py-3">
        <Badge dotClass={status.dot} textClass={status.text} bgClass={status.bg} className="max-w-full">
          <span className="truncate">{ticket.Status}</span>
        </Badge>
      </td>
      <td className="px-3.5 py-3">
        {ticket.Priority ? (
          <Badge textClass={priority.text} bgClass={priority.bg} className={`border ${priority.border}`}>
            {ticket.Priority}
          </Badge>
        ) : (
          <span className="text-[12px] text-muted">-</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3.5 py-3">
        {sla ? (
          <p className={`flex items-center gap-1.5 text-[12px] ${sla.overdue ? 'font-semibold text-danger' : 'text-slate-600'}`}>
            {sla.stopped ? (sla.overdue ? 'Breached' : 'Met') : sla.overdue ? `Overdue ${formatMinutes(sla.minutes)}` : `${formatMinutes(sla.minutes)} left`}
            {escalation && (
              <span className={`rounded border px-1 text-[11px] font-bold ${escalation.bg} ${escalation.text} ${escalation.border}`}>L{ticket.Escalation_Level}</span>
            )}
          </p>
        ) : (
          <span className="text-[12px] text-muted">No SLA</span>
        )}
      </td>
      <td className="truncate px-3.5 py-3 text-[12.5px] text-slate-600">{ticket.Bank_Name || '-'}</td>
      <td className="px-3.5 py-3">
        <AssigneeStack assignees={ticket.Assignees} />
      </td>
      <td className="px-3.5 py-3 text-[12px] text-muted">
        {ticket.My_Assigned_Time ? (
          <>
            <p className="whitespace-nowrap text-slate-600">{formatDateTime(ticket.My_Assigned_Time)}</p>
            {ticket.My_Assigned_By_Name && <p className="truncate">by {ticket.My_Assigned_By_Name}</p>}
          </>
        ) : (
          '-'
        )}
      </td>
    </tr>
  )
}

/**
 * My Tickets: how an agent learns what was assigned to them. Everyone sees
 * tickets assigned to them (new ones flagged until opened) and tickets
 * they assigned to others (e.g. pulled a Java/Angular member in); team
 * leads also see every ticket of their team.
 */
export default function MyTicketsPage() {
  const { can, agent: me } = useAuth()
  const isLead = can(PERMISSIONS.TICKETS_ASSIGN_TEAM) || can(PERMISSIONS.TICKETS_ASSIGN_ANY)
  const tabs = TABS.filter((t) => !t.leadOnly || (isLead && me?.teamId))
  const [searchParams, setSearchParams] = useSearchParams()
  const scope = tabs.some((t) => t.value === searchParams.get('tab')) ? searchParams.get('tab') : 'assigned'
  const [includeClosed, setIncludeClosed] = useState(false)
  const [counts, setCounts] = useState(null)
  const [state, setState] = useState({ loading: true, error: null, tickets: [] })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    getMyTicketCounts()
      .then((res) => setCounts(res.data))
      .catch(() => {})
  }, [reloadKey, state.tickets])

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))
    getMyTickets({ scope, includeClosed: includeClosed ? 'true' : undefined })
      .then((res) => !cancelled && setState({ loading: false, error: null, tickets: res.data }))
      .catch((err) => !cancelled && setState({ loading: false, error: err instanceof ApiError ? err.message : 'Failed to load your tickets.', tickets: [] }))
    return () => {
      cancelled = true
    }
  }, [scope, includeClosed, reloadKey])

  const unseen = counts?.unseen || 0

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title="My Tickets"
        subtitle={unseen > 0 ? `${unseen} newly assigned ticket${unseen === 1 ? '' : 's'} waiting for you` : 'Tickets assigned to you and by you'}
        actions={
          <div className="flex gap-1 rounded-xl border border-slate-200/90 bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            {tabs.map(({ value, label, icon: Icon, countKey }) => (
              <button
                key={value}
                onClick={() => setSearchParams(value === 'assigned' ? {} : { tab: value })}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${
                  scope === value ? 'bg-navy text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-ink'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {counts && (
                  <span className={`rounded-full px-1.5 font-mono text-[11px] ${scope === value ? 'bg-white/20' : 'bg-slate-100'}`}>{counts[countKey]}</span>
                )}
              </button>
            ))}
          </div>
        }
      />

      <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] font-medium text-ink">
        <input type="checkbox" checked={includeClosed} onChange={(e) => setIncludeClosed(e.target.checked)} className="h-4 w-4 accent-primary" />
        Include resolved and closed
      </label>

      {state.error ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-card">
          <ErrorState message={state.error} onRetry={() => setReloadKey((k) => k + 1)} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-card">
          <table className="w-full table-fixed border-collapse text-[12.5px]">
            <colgroup>
              {COLUMNS.map((col) => (
                <col key={col.label} style={{ width: col.width }} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-gradient-to-b from-[#F4F7FB] to-[#E9EEF6]">
                {COLUMNS.map((col) => (
                  <th key={col.label} className="whitespace-nowrap border-b border-border-strong px-3.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-700">
                    {col.label === 'Assigned' && scope === 'team' ? '' : col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.loading && <SkeletonRows columns={COLUMNS.length} />}
              {!state.loading && state.tickets.map((t) => <Row key={t.Ticket_Id} ticket={t} scope={scope} />)}
            </tbody>
          </table>
          {!state.loading && state.tickets.length === 0 && (
            <EmptyState
              title={scope === 'assigned' ? 'Nothing assigned to you' : scope === 'assignedBy' ? 'You have not assigned anyone' : 'No open tickets for your team'}
              description={includeClosed ? 'No tickets match.' : 'Resolved and closed tickets are hidden - tick the box above to include them.'}
            />
          )}
        </div>
      )}
    </div>
  )
}
