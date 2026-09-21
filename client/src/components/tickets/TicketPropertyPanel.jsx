import Avatar from '../ui/Avatar.jsx'
import Badge from '../ui/Badge.jsx'
import { getStatusStyle, getPriorityStyle } from '../../utils/ticketMeta.js'
import { formatDateTime } from '../../utils/format.js'

function Field({ label, children }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <div className="text-[13px] font-medium text-ink">{children}</div>
    </div>
  )
}

/** Floating white panel with ticket properties - status/priority, contact/account, department/team/assignee, key dates. */
export default function TicketPropertyPanel({ ticket, contact, account, department, team, assignee }) {
  const status = getStatusStyle(ticket.Status_Type)
  const priority = getPriorityStyle(ticket.Priority)
  const contactName = contact ? [contact.First_Name, contact.Last_Name].filter(Boolean).join(' ') : '-'
  const assigneeName = assignee ? [assignee.First_Name, assignee.Last_Name].filter(Boolean).join(' ') : null

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <Badge dotClass={status.dot} textClass={status.text} bgClass={status.bg}>
          {ticket.Status}
        </Badge>
        {ticket.Priority && (
          <Badge textClass={priority.text} bgClass={priority.bg} className={`border ${priority.border}`}>
            {priority.label}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Contact">
          <div className="flex items-center gap-2">
            <Avatar name={contactName} size={22} />
            <span className="truncate">{contactName}</span>
          </div>
        </Field>
        <Field label="Account">{account?.Account_Name || '-'}</Field>
        <Field label="Department">{department?.Department_Name || '-'}</Field>
        <Field label="Team">{team?.Team_Name || '-'}</Field>
        <Field label="Assignee">
          {assigneeName ? (
            <div className="flex items-center gap-2">
              <Avatar name={assigneeName} size={22} />
              <span className="truncate">{assigneeName}</span>
            </div>
          ) : (
            <span className="italic text-muted">Unassigned</span>
          )}
        </Field>
        <Field label="Channel">{ticket.Channel}</Field>
      </div>

      <div className="border-t border-[#EEF2F8] pt-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Created">{formatDateTime(ticket.Created_Time)}</Field>
          <Field label="Last updated">{formatDateTime(ticket.Modified_Time)}</Field>
          {ticket.Due_Date && <Field label="Due">{formatDateTime(ticket.Due_Date)}</Field>}
          {ticket.Closed_Time && <Field label="Closed">{formatDateTime(ticket.Closed_Time)}</Field>}
        </div>
      </div>

      <div className="border-t border-[#EEF2F8] pt-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="font-mono text-[16px] font-bold text-ink">{ticket.Thread_Count}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Messages</p>
          </div>
          <div>
            <p className="font-mono text-[16px] font-bold text-ink">{ticket.Comment_Count}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Notes</p>
          </div>
          <div>
            <p className="font-mono text-[16px] font-bold text-ink">{ticket.Attachment_Count}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Files</p>
          </div>
        </div>
      </div>
    </div>
  )
}
