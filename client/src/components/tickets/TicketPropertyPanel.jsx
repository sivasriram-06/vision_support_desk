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
import { useAuth } from '../../auth/AuthContext.jsx'
import { PERMISSIONS } from '../../auth/permissions.js'
import { getSupportLevelStyle } from '../../utils/bankMeta.js'
import {
  ApiError,
  updateTicket,
  getDepartments,
  getBanks,
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

function ResourceNames({ agents }) {
  if (!agents?.length) return <span className="text-muted">-</span>
  return (
    <div className="flex flex-col gap-1">
      {agents.map((a) => (
        <div key={a.Agent_Id} className="flex min-w-0 items-center gap-1.5">
          <Avatar name={fullNameOf(a)} size={20} />
          <span className="truncate">{fullNameOf(a)}</span>
        </div>
      ))}
    </div>
  )
}

/** The ticket's bank: which team works it, its support contract, and who is primary / secondary. */
function BankSection({ bank }) {
  if (!bank) {
    return (
      <div className="flex flex-col gap-2 border-t border-[#EEF2F8] pt-4">
        <SectionHeading>Bank</SectionHeading>
        <p className="text-[12.5px] italic text-muted">No bank set on this ticket yet.</p>
      </div>
    )
  }
  const level = bank.Support_Level ? getSupportLevelStyle(bank.Support_Level) : null
  return (
    <div className="flex flex-col gap-4 border-t border-[#EEF2F8] pt-4">
      <SectionHeading>Bank</SectionHeading>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold text-ink">{bank.Bank_Name}</p>
          <p className="truncate text-[12px] text-muted">{[bank.Country, bank.Module].filter(Boolean).join(' · ') || '-'}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {level && (
            <Badge textClass={level.text} bgClass={level.bg} className={`border ${level.border}`}>
              {bank.Support_Level}
            </Badge>
          )}
          {bank.Is_24x7 === 'Y' && (
            <Badge textClass="text-primary-dark" bgClass="bg-primary/10">
              24x7
            </Badge>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Works this bank">{bank.Support_Team_Name || '-'}</Field>
        <Field label="Support days">{bank.Support_Days || '-'}</Field>
        <Field label="Hours (local)">{bank.Support_Hours_Local || '-'}</Field>
        <Field label="Hours (IST)">{bank.Support_Hours_Ist || '-'}</Field>
        <Field label="Primary resource">
          <ResourceNames agents={bank.Primary_Resources} />
        </Field>
        <Field label="Secondary resource">
          <ResourceNames agents={bank.Secondary_Resources} />
        </Field>
      </div>
      {bank.Remarks && <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">{bank.Remarks}</p>}
    </div>
  )
}

const fullNameOf = (a) => [a.First_Name, a.Last_Name].filter(Boolean).join(' ')

export default function TicketPropertyPanel({ ticket, contact, account, department, bank, assignee, product, onUpdated }) {
  const { can, agent: me } = useAuth()
  const canEditStatus = can(PERMISSIONS.TICKETS_EDIT_STATUS)
  const canEditProperties = can(PERMISSIONS.TICKETS_EDIT_PROPERTIES)
  const canAssignAny = can(PERMISSIONS.TICKETS_ASSIGN_ANY)
  const canAssign = canAssignAny || can(PERMISSIONS.TICKETS_ASSIGN_TEAM)
  const canEditAnything = canEditStatus || canEditProperties || canAssign
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [options, setOptions] = useState({ departments: [], banks: [], agents: [], products: [], classifications: [], priorities: [], statuses: [] })
  const [categoryOptions, setCategoryOptions] = useState([])
  const [form, setForm] = useState(null)

  useEffect(() => {
    if (!isEditing) return
    setForm({
      status: ticket.Status || '',
      priority: ticket.Priority || '',
      departmentId: ticket.Department_Id || '',
      bankId: ticket.Bank_Id || '',
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
      getBanks(),
      getAgents(),
      getProducts(),
      getPicklistValues('CLASSIFICATION'),
      getPrioritySlaConfig(),
      getPicklistValues('STATUS'),
    ])
      .then(([departmentsRes, banksRes, agentsRes, productsRes, classificationsRes, prioritiesRes, statusesRes]) => {
        if (cancelled) return
        setOptions({
          departments: departmentsRes.data,
          banks: banksRes.data,
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

  // A bank is worked by one support team, so choosing it also routes the
  // ticket to that team's department (the server applies the same rule).
  const updateBank = (bankId) =>
    setForm((prev) => {
      const picked = options.banks.find((b) => b.Bank_Id === bankId)
      return { ...prev, bankId, departmentId: picked?.Department_Id || prev.departmentId }
    })

  const updateClassification = (value) =>
    setForm((prev) => ({ ...prev, classification: value, category: '' }))

  // Only fields the agent actually changed are sent: the server authorizes
  // per field (a Team Member may change Status but not Priority), so
  // re-sending untouched values would be refused for no reason.
  const buildChanges = () => {
    const next = {
      status: form.status || null,
      priority: form.priority || null,
      departmentId: form.departmentId,
      bankId: form.bankId || null,
      assigneeId: form.assigneeId || null,
      productId: form.productId || null,
      classification: form.classification || null,
      category: form.category || null,
    }
    const current = {
      status: ticket.Status || null,
      priority: ticket.Priority || null,
      departmentId: ticket.Department_Id,
      bankId: ticket.Bank_Id || null,
      assigneeId: ticket.Assignee_Id || null,
      productId: ticket.Product_Id || null,
      classification: ticket.Classification || null,
      category: ticket.Category || null,
    }
    const changes = Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== current[key]))
    if (form.dueDate !== toDatetimeLocalValue(ticket.Due_Date)) {
      changes.dueDate = form.dueDate ? new Date(form.dueDate).toISOString() : null
    }
    return changes
  }

  const handleSave = async () => {
    const changes = buildChanges()
    if (Object.keys(changes).length === 0) {
      setIsEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateTicket(ticket.Ticket_Id, changes)
      setIsEditing(false)
      onUpdated?.()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  // Team Leads may only hand tickets to their own team; the current assignee
  // stays listed so the field still shows who owns the ticket today.
  const assigneeOptions = options.agents.filter(
    (a) =>
      a.Agent_Id === ticket.Assignee_Id ||
      (a.Status === 'Active' && (canAssignAny || (me?.teamId && a.Primary_Department_Id === me.teamId))),
  )

  const formBank = options.banks.find((b) => b.Bank_Id === form?.bankId)
  const resourceTag = (agentId) => {
    if (formBank?.Primary_Resources.some((a) => a.Agent_Id === agentId)) return ' ★ Primary'
    if (formBank?.Secondary_Resources.some((a) => a.Agent_Id === agentId)) return ' · Secondary'
    return ''
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
        {!isEditing && canEditAnything && (
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
            <div className="col-span-2">
              <Field label="Bank">
                <Select
                  value={form.bankId}
                  onChange={(e) => updateBank(e.target.value)}
                  options={options.banks.map((b) => ({
                    value: b.Bank_Id,
                    label: b.Support_Team_Name ? `${b.Bank_Name} — ${b.Support_Team_Name}` : b.Bank_Name,
                  }))}
                  placeholder="Not set"
                  disabled={!canEditProperties}
                />
              </Field>
            </div>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(e) => updateField('status', e.target.value)}
                options={options.statuses.map((s) => ({ value: s.Value, label: s.Value }))}
                placeholder="Unset"
                disabled={!canEditStatus}
              />
            </Field>
            <Field label="Priority">
              <Select
                value={form.priority}
                onChange={(e) => updateField('priority', e.target.value)}
                options={options.priorities.map((p) => ({ value: p.Priority, label: p.Priority }))}
                placeholder="Unset"
                disabled={!canEditProperties}
              />
            </Field>
            <Field label="Support team">
              <Select
                value={form.departmentId}
                onChange={(e) => updateField('departmentId', e.target.value)}
                options={options.departments.map((d) => ({ value: d.Department_Id, label: d.Department_Name }))}
                disabled={!canEditProperties}
              />
            </Field>
            <Field label="Assignee">
              <Select
                value={form.assigneeId}
                onChange={(e) => updateField('assigneeId', e.target.value)}
                options={assigneeOptions.map((a) => ({
                  value: a.Agent_Id,
                  label: fullNameOf(a) + (canAssignAny && a.Team_Name ? ` (${a.Team_Name})` : '') + resourceTag(a.Agent_Id),
                }))}
                placeholder="Unassigned"
                disabled={!canAssign}
              />
            </Field>
            <Field label="Product">
              <Select
                value={form.productId}
                onChange={(e) => updateField('productId', e.target.value)}
                options={options.products.map((p) => ({ value: p.Product_Id, label: p.Product_Name }))}
                placeholder="Unset"
                disabled={!canEditProperties}
              />
            </Field>
            <Field label="Due date">
              <Input
                type="datetime-local"
                value={form.dueDate}
                onChange={(e) => updateField('dueDate', e.target.value)}
                disabled={!canEditProperties}
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
                disabled={!canEditProperties}
              />
            </Field>
            <Field label="Category">
              <Select
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
                options={categoryOptions.map((c) => ({ value: c.Value, label: c.Value }))}
                placeholder={form.classification ? 'Unset' : 'Pick a classification first'}
                disabled={!form.classification || !canEditProperties}
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
                  <p className="truncate">{assigneeName}</p>
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

          <BankSection bank={bank} />

          <div className="flex flex-col gap-4 border-t border-[#EEF2F8] pt-4">
            <SectionHeading>Ticket Information</SectionHeading>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Support team">{department?.Department_Name || '-'}</Field>
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
