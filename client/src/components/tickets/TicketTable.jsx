import { useNavigate } from 'react-router-dom'
import { Mail, Globe, MessageSquare, Phone, Share2 } from 'lucide-react'
import Badge from '../ui/Badge.jsx'
import Avatar from '../ui/Avatar.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import SkeletonRows from '../ui/SkeletonRows.jsx'
import Pagination from '../ui/Pagination.jsx'
import { getStatusStyle, getPriorityStyle } from '../../utils/ticketMeta.js'
import { formatDateTime } from '../../utils/format.js'

const CHANNEL_ICONS = { Email: Mail, 'Web Form': Globe, Chat: MessageSquare, Phone: Phone, Social: Share2 }

// Fixed proportional widths (sum to 100%) so the table always fits the
// container at 100% - no horizontal scrollbar at any desktop/tablet/2xl
// size. Content truncates within its own column instead of forcing overflow.
const COLUMNS = [
  { label: 'Ticket', width: '9%' },
  { label: 'Subject', width: '31%' },
  { label: 'Status', width: '11%' },
  { label: 'Priority', width: '10%' },
  { label: 'Contact', width: '16%' },
  { label: 'Assignee', width: '15%' },
  { label: 'Created', width: '8%' },
]

function TicketRow({ ticket }) {
  const navigate = useNavigate()
  const status = getStatusStyle(ticket.Status_Type)
  const priority = getPriorityStyle(ticket.Priority)
  const ChannelIcon = CHANNEL_ICONS[ticket.Channel] || Mail
  const contactName = [ticket.Contact_First_Name, ticket.Contact_Last_Name].filter(Boolean).join(' ') || 'Unknown contact'
  const assigneeName = [ticket.Assignee_First_Name, ticket.Assignee_Last_Name].filter(Boolean).join(' ')

  return (
    <tr
      onClick={() => navigate(`/tickets/${ticket.Ticket_Id}`)}
      className="cursor-pointer transition-colors even:bg-[#F8FAFD] hover:bg-[#EBF3FE]"
    >
      <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3.5 py-3 font-mono text-[12px] font-semibold text-slate-500">
        #{ticket.Ticket_Number}
      </td>
      <td className="px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <ChannelIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
          <span className="truncate text-[13px] font-semibold text-ink">{ticket.Subject}</span>
        </div>
      </td>
      <td className="overflow-hidden px-3.5 py-3">
        <Badge dotClass={status.dot} textClass={status.text} bgClass={status.bg} className="max-w-full">
          <span className="truncate">{ticket.Status || status.label}</span>
        </Badge>
      </td>
      <td className="overflow-hidden px-3.5 py-3">
        {ticket.Priority ? (
          <Badge textClass={priority.text} bgClass={priority.bg} className={`border ${priority.border}`}>
            {ticket.Priority}
          </Badge>
        ) : (
          <span className="text-[12px] text-muted">-</span>
        )}
      </td>
      <td className="px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={contactName} size={24} />
          <span className="truncate text-[12.5px] font-medium text-slate-600">{contactName}</span>
        </div>
      </td>
      <td className="px-3.5 py-3">
        {assigneeName ? (
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={assigneeName} size={24} />
            <span className="truncate text-[12.5px] font-medium text-slate-600">{assigneeName}</span>
          </div>
        ) : (
          <span className="text-[12px] italic text-muted">Unassigned</span>
        )}
      </td>
      <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3.5 py-3 text-[12.5px] text-muted">
        {formatDateTime(ticket.Created_Time)}
      </td>
    </tr>
  )
}

export default function TicketTable({ tickets, loading, error, paging, onPageChange }) {
  return (
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
              <th
                key={col.label}
                className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-border-strong px-3.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-700"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && <SkeletonRows columns={COLUMNS.length} />}
          {!loading && !error && tickets.map((ticket) => <TicketRow key={ticket.Ticket_Id} ticket={ticket} />)}
        </tbody>
      </table>

      {!loading && !error && tickets.length === 0 && (
        <EmptyState title="No tickets found" description="Try adjusting your filters, or wait for the next Gmail sync." />
      )}

      {!loading && !error && tickets.length > 0 && <Pagination paging={paging} onPageChange={onPageChange} />}
    </div>
  )
}
