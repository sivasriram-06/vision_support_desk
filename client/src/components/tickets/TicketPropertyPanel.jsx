import { useEffect, useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import Avatar from '../ui/Avatar.jsx'
import Badge from '../ui/Badge.jsx'
import Select from '../ui/Select.jsx'
import Input from '../ui/Input.jsx'
import Button from '../ui/Button.jsx'
import {
  getStatusStyle,
  getPriorityStyle,
  getTicketAgeDays,
  getAgeingBucketLabel,
} from '../../utils/ticketMeta.js'
import { formatDateTime } from '../../utils/format.js'
import {
  ApiError,
  updateTicket,
  getDepartments,
  getTeams,
  getAgents,
  getProducts,
  getPicklistValues,
  getPrioritySlaConfig,
} from '../../utils/api.js'

const toDatetimeLocalValue = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16) : '')

function Field({ label, children }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <div className="text-[13px] font-medium text-ink">{children}</div>
    </div>
  )
}

function SectionHeading({ children }) {
  return <p className="text-[13px] font-bold tracking-wider text-ink-strong">{children}</p>
}

export default function TicketPropertyPanel({ ticket, contact, account, department, team, assignee, product, onUpdated }) {
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [options, setOptions] = useState({ departments: [], teams: [], agents: [], products: [], classifications: [], priorities: [], statuses: [] })
  const [categoryOptions, setCategoryOptions] = useState([])
  const [form, setForm] = useState(null)

  useEffect(() => {
    if (!isEditing) return
    setForm({
      status: ticket.Status || '',
      priority: ticket.Priority || '',
      departmentId: ticket.Department_Id || '',
      teamId: ticket.Team_Id || '',
      assigneeId: ticket.Assignee_Id || '',
      productId: ticket.Product_Id || '',
      classification: ticket.Classification || '',
      category: ticket.Category || '',
      dueDate: toDatetimeLocalValue(ticket.Due_Date),
    })
    setError(null)

    let cancelled = false
    Promise.all([
      getDepartments(),
      getTeams(),
      getAgents(),
      getProducts(),
      getPicklistValues('CLASSIFICATION'),
      getPrioritySlaConfig(),
      getPicklistValues('STATUS'),
    ])
      .then(([departmentsRes, teamsRes, agentsRes, productsRes, classificationsRes, prioritiesRes, statusesRes]) => {
        if (cancelled) return
        setOptions({
          departments: departmentsRes.data,
          teams: teamsRes.data,
          agents: agentsRes.data,
          products: productsRes.data,
          classifications: classificationsRes.data,
          priorities: prioritiesRes.data,
          statuses: statusesRes.data,
        })
      })
      .catch(() => {
        if (!cancelled) setError('Could not load edit options.')
      })
    return () => {
      cancelled = true
    }
  }, [isEditing, ticket])

  useEffect(() => {
    if (!isEditing || !form?.classification) {
      setCategoryOptions([])
      return
    }
    let cancelled = false
    getPicklistValues('CATEGORY', form.classification).then((res) => {
      if (!cancelled) setCategoryOptions(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [isEditing, form?.classification])

  const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const updateClassification = (value) =>
    setForm((prev) => ({ ...prev, classification: value, category: '' }))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await updateTicket(ticket.Ticket_Id, {
        status: form.status || null,
        priority: form.priority || null,
        departmentId: form.departmentId,
        teamId: form.teamId || null,
        assigneeId: form.assigneeId || null,
        productId: form.productId || null,
        classification: form.classification || null,
        category: form.category || null,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
      })
      setIsEditing(false)
      onUpdated?.()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  const status = getStatusStyle(ticket.Status_Type)
  const priority = getPriorityStyle(ticket.Priority)
  const contactName = contact ? [contact.First_Name, contact.Last_Name].filter(Boolean).join(' ') : '-'
  const assigneeName = assignee ? [assignee.First_Name, assignee.Last_Name].filter(Boolean).join(' ') : null
  const ageDays = getTicketAgeDays(ticket)
  const ageingBucket = getAgeingBucketLabel(ageDays)
  const isSlaOverdue =
    ticket.Response_Due_Date && ticket.Status_Type !== 'Closed' && new Date(ticket.Response_Due_Date) < new Date()

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading>Ticket Properties</SectionHeading>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            title="Edit ticket properties"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted transition hover:bg-slate-50 hover:text-ink cursor-pointer"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12px] font-medium text-danger">{error}</p>}

      {isEditing && form ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(e) => updateField('status', e.target.value)}
                options={options.statuses.map((s) => ({ value: s.Value, label: s.Value }))}
                placeholder="Unset"
              />
            </Field>
            <Field label="Priority">
              <Select
                value={form.priority}
                onChange={(e) => updateField('priority', e.target.value)}
                options={options.priorities.map((p) => ({ value: p.Priority, label: p.Priority }))}
                placeholder="Unset"
              />
            </Field>
            <Field label="Department">
              <Select
                value={form.departmentId}
                onChange={(e) => updateField('departmentId', e.target.value)}
                options={options.departments.map((d) => ({ value: d.Department_Id, label: d.Department_Name }))}
              />
            </Field>
            <Field label="Team">
              <Select
                value={form.teamId}
                onChange={(e) => updateField('teamId', e.target.value)}
                options={options.teams.map((t) => ({ value: t.Team_Id, label: t.Team_Name }))}
                placeholder="Unassigned"
              />
            </Field>
            <Field label="Assignee">
              <Select
                value={form.assigneeId}
                onChange={(e) => updateField('assigneeId', e.target.value)}
                options={options.agents.map((a) => ({ value: a.Agent_Id, label: [a.First_Name, a.Last_Name].filter(Boolean).join(' ') }))}
                placeholder="Unassigned"
              />
            </Field>
            <Field label="Product">
              <Select
                value={form.productId}
                onChange={(e) => updateField('productId', e.target.value)}
                options={options.products.map((p) => ({ value: p.Product_Id, label: p.Product_Name }))}
                placeholder="Unset"
              />
            </Field>
            <Field label="Due date">
              <Input
                type="datetime-local"
                value={form.dueDate}
                onChange={(e) => updateField('dueDate', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-[#EEF2F8] pt-4">
            <Field label="Classification">
              <Select
                value={form.classification}
                onChange={(e) => updateClassification(e.target.value)}
                options={options.classifications.map((c) => ({ value: c.Value, label: c.Value }))}
                placeholder="Unset"
              />
            </Field>
            <Field label="Category">
              <Select
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
                options={categoryOptions.map((c) => ({ value: c.Value, label: c.Value }))}
                placeholder={form.classification ? 'Unset' : 'Pick a classification first'}
                disabled={!form.classification}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-[#EEF2F8] pt-4">
            <Button variant="secondary" icon={X} onClick={() => setIsEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" icon={Check} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <SectionHeading>Contact Info</SectionHeading>
            <div className="flex items-center gap-2.5">
              <Avatar name={contactName} size={30} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-ink">{contactName}</p>
                <p className="truncate text-[12px] text-muted">{contact?.Email || '-'}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-[#EEF2F8] pt-4">
            <SectionHeading>Key Information</SectionHeading>
            <Field label="Ticket Owner">
              {assigneeName ? (
                <div className="flex items-center gap-2">
                  <Avatar name={assigneeName} size={22} />
                  <div className="min-w-0">
                    <p className="truncate">{assigneeName}</p>
                    {team?.Team_Name && <p className="truncate text-[11.5px] font-normal text-muted">{team.Team_Name}</p>}
                  </div>
                </div>
              ) : (
                <span className="italic text-muted">Unassigned</span>
              )}
            </Field>
            <Field label="Status">
              <Badge dotClass={status.dot} textClass={status.text} bgClass={status.bg}>
                {ticket.Status}
              </Badge>
            </Field>
            {ticket.Closed_Time && <Field label="Closed time">{formatDateTime(ticket.Closed_Time)}</Field>}
          </div>

          <div className="flex flex-col gap-4 border-t border-[#EEF2F8] pt-4">
            <SectionHeading>Ticket Information</SectionHeading>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Department">{department?.Department_Name || '-'}</Field>
              <Field label="Team">{team?.Team_Name || '-'}</Field>
              <Field label="Product">{product?.Product_Name || '-'}</Field>
              <Field label="Due date">{ticket.Due_Date ? formatDateTime(ticket.Due_Date) : '-'}</Field>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-[#EEF2F8] pt-4">
            <SectionHeading>Additional Information</SectionHeading>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Classification">{ticket.Classification || '-'}</Field>
              <Field label="Category">{ticket.Category || '-'}</Field>
              <Field label="Priority">
                {ticket.Priority ? (
                  <Badge textClass={priority.text} bgClass={priority.bg} className={`border ${priority.border}`}>
                    {ticket.Priority}
                  </Badge>
                ) : (
                  '-'
                )}
              </Field>
              <Field label="Channel">{ticket.Channel}</Field>
              <Field label="Response due (SLA)">
                {ticket.Response_Due_Date ? (
                  <span className={isSlaOverdue ? 'font-semibold text-danger' : ''}>
                    {formatDateTime(ticket.Response_Due_Date)}
                    {isSlaOverdue && ' · Overdue'}
                  </span>
                ) : (
                  '-'
                )}
              </Field>
              <Field label="Ticket age - days">{ageDays === null ? '-' : ageDays}</Field>
              <Field label="Ageing bucket">{ageingBucket || 'None'}</Field>
            </div>
          </div>

          <div className="border-t border-[#EEF2F8] pt-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Created">{formatDateTime(ticket.Created_Time)}</Field>
              <Field label="Last updated">{formatDateTime(ticket.Modified_Time)}</Field>
            </div>
          </div>

          <div className="border-t border-[#EEF2F8] pt-4">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <p className="font-mono text-[16px] font-bold text-ink">{ticket.Thread_Count}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Messages</p>
              </div>
              <div>
                <p className="font-mono text-[16px] font-bold text-ink">{ticket.Attachment_Count}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Files</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
