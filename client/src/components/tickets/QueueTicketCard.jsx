import { useNavigate } from 'react-router-dom'
import { Inbox, Hourglass, Tag, Siren } from 'lucide-react'
import Badge from '../ui/Badge.jsx'
import AssigneeStack from './AssigneeStack.jsx'
import { getPriorityStyle } from '../../utils/ticketMeta.js'
import { getClockStyle, getSlaState, formatMinutes, getEscalationStyle } from '../../utils/clockMeta.js'
import { formatDateTime } from '../../utils/format.js'

const fullName = (first, last) => [first, last].filter(Boolean).join(' ')

/**
 * One ticket on a queue board. `mode` says what the column already groups
 * by, so the card shows the other facet: 'priority' -> status badge,
 * 'status' -> priority badge, 'escalation' -> both, plus when the next
 * escalation level falls due.
 */
export default function QueueCard({ ticket, mode }) {
  const navigate = useNavigate()
  const sla = getSlaState(ticket)
  const status = getClockStyle(ticket.Clock_State)
  const priority = getPriorityStyle(ticket.Priority)
  const contact = fullName(ticket.Contact_First_Name, ticket.Contact_Last_Name) || 'Unknown contact'
  const level = ticket.Escalation_Level || 0
  const escalation = level > 0 ? getEscalationStyle(level) : null
  const showStatus = mode !== 'status'
  const showPriority = mode !== 'priority' && ticket.Priority

  return (
    <button
      onClick={() => navigate(`/tickets/${ticket.Ticket_Id}`)}
      className="group flex w-full cursor-pointer flex-col gap-2.5 rounded-xl border border-slate-200/90 bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition hover:-translate-y-px hover:border-primary/40 hover:shadow-card"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-[13px] font-bold leading-snug text-ink group-hover:text-primary-dark">{ticket.Subject}</p>
        {ticket.Assignees?.length ? (
          <AssigneeStack assignees={ticket.Assignees} size={26} max={2} />
        ) : (
          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">Unassigned</span>
        )}
      </div>

      <p className="truncate text-[12px] text-muted">
        <span className="font-mono font-semibold text-slate-500">#{ticket.Ticket_Number}</span>
        <span className="mx-1.5">·</span>
        {mode === 'escalation' && ticket.Bank_Name ? ticket.Bank_Name : contact}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {showPriority && (
          <Badge textClass={priority.text} bgClass={priority.bg} className={`border ${priority.border}`}>
            {ticket.Priority}
          </Badge>
        )}
        {showStatus && (
          <Badge dotClass={status.dot} textClass={status.text} bgClass={status.bg}>
            {ticket.Status || '-'}
          </Badge>
        )}
        {/* Outside the Escalations board (where the column says it), flag the level on the card. */}
        {escalation && mode !== 'escalation' && (
          <Badge textClass={escalation.text} bgClass={escalation.bg} className={`border ${escalation.border}`}>
            <Siren className="h-3 w-3" />L{level}
          </Badge>
        )}
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
        {mode === 'escalation' ? (
          <span className="text-muted">
            {ticket.Next_Escalation_Time
              ? `Next level in ${formatMinutes((new Date(ticket.Next_Escalation_Time) - new Date()) / 60000)}`
              : 'Top level'}
          </span>
        ) : (
          <span className="text-muted">{formatDateTime(ticket.Created_Time)}</span>
        )}
      </div>
    </button>
  )
}

export function QueueColumn({ title, subtitle, tickets, mode, accentClass, emptyText = 'No tickets in this queue' }) {
  return (
    <div className="flex h-full w-[300px] shrink-0 flex-col rounded-2xl border border-slate-200/80 bg-[#EEF2F8]/70">
      <div className="px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${accentClass}`} />
          <p className="truncate text-[12px] font-bold uppercase tracking-wider text-navy">{title}</p>
          <span className="ml-auto rounded-full bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-500 shadow-sm">
            {tickets.length}
          </span>
        </div>
        {subtitle && <p className="mt-1 truncate pl-4 text-[11px] text-muted" title={subtitle}>{subtitle}</p>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-3">
        {tickets.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
            <Inbox className="h-6 w-6 text-slate-300" />
            <p className="text-[12px] text-muted">{emptyText}</p>
          </div>
        ) : (
          tickets.map((t) => <QueueCard key={t.Ticket_Id} ticket={t} mode={mode} />)
        )}
      </div>
    </div>
  )
}
