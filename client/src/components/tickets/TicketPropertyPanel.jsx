import { useEffect, useState } from 'react'
import { Pencil, Check, X, Timer, Hourglass, Siren } from 'lucide-react'
import Avatar from '../ui/Avatar.jsx'
import Badge from '../ui/Badge.jsx'
import Select from '../ui/Select.jsx'
import Button from '../ui/Button.jsx'
import {
  getPriorityStyle,
  getTicketAgeDays,
  getAgeingBucketLabel,
} from '../../utils/ticketMeta.js'
import { formatDateTime } from '../../utils/format.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { PERMISSIONS } from '../../auth/permissions.js'
import {
  getSupportLevelStyle,
  formatWorkingDays,
  formatSupportHours,
  formatLocalSupportHours,
  DEFAULT_SUPPORT_START_IST,
  DEFAULT_SUPPORT_END_IST,
} from '../../utils/bankMeta.js'
import { getClockStyle, getClockLabel, formatMinutes, getSlaState, getEscalationStyle } from '../../utils/clockMeta.js'
import {
  ApiError,
  updateTicket,
  getDepartments,
  getBanks,
  getAgents,
  getProducts,
  getPicklistValues,
  getPrioritySlaConfig,
  getTicketMetrics,
} from '../../utils/api.js'


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
        <Field label="Working days">{formatWorkingDays(bank.Working_Days, bank.Is_24x7 === 'Y')}</Field>
        <Field label="Support hours">{formatSupportHours(bank)}</Field>
        <Field label="Hours (local)">{formatLocalSupportHours(bank) || '-'}</Field>
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

const formatInZone = (date, timeZone) =>
  new Date(date).toLocaleString(undefined, { timeZone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/**
 * SLA due date: priority SLA hours from when the ticket came in, on the
 * bank's working days. Fixed - status changes never move it.
 */
function EscalationLine({ escalation }) {
  if (!escalation || (escalation.level === 0 && !escalation.nextTriggerTime)) return null
  const minutesToNext = escalation.nextTriggerTime ? (new Date(escalation.nextTriggerTime) - new Date()) / 60000 : null
  if (escalation.level === 0) {
    return (
      <p className="text-[11.5px] text-muted">
        Escalates to L{escalation.nextLevelNo} in {formatMinutes(minutesToNext)}
      </p>
    )
  }
  const style = getEscalationStyle(escalation.level)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge textClass={style.text} bgClass={style.bg} className={`border ${style.border}`}>
        <Siren className="h-3 w-3" />
        Escalation level {escalation.level}
      </Badge>
      <span className="text-[11.5px] text-muted">
        {escalation.nextTriggerTime ? `L${escalation.nextLevelNo} in ${formatMinutes(minutesToNext)}` : 'Top level reached'}
      </span>
    </div>
  )
}

function SlaSection({ ticket, bank, escalation }) {
  const sla = getSlaState(ticket)
  return (
    <div className="flex flex-col gap-3 border-t border-[#EEF2F8] pt-4">
      <div className="flex items-center gap-1.5">
        <Hourglass className="h-3.5 w-3.5 text-primary" />
        <SectionHeading>SLA</SectionHeading>
      </div>
      {!sla ? (
        <p className="text-[12.5px] italic text-muted">
          {ticket.Priority ? 'No SLA hours configured for this priority.' : 'Set a priority to start the SLA.'}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-ink">
                Due {formatInZone(sla.due, bank?.Time_Zone || 'Asia/Kolkata')}
                {bank?.Time_Zone && <span className="font-normal text-muted"> bank time</span>}
              </p>
              <p className="text-[11.5px] text-muted">IST {formatInZone(sla.due, 'Asia/Kolkata')}</p>
            </div>
            {sla.stopped ? (
              <Badge textClass={sla.overdue ? 'text-danger' : 'text-success-dark'} bgClass={sla.overdue ? 'bg-danger/10' : 'bg-success/10'}>
                {sla.overdue ? `Breached by ${formatMinutes(sla.minutes)}` : 'Met'}
              </Badge>
            ) : (
              <Badge textClass={sla.overdue ? 'text-danger' : 'text-sky-dark'} bgClass={sla.overdue ? 'bg-danger/10' : 'bg-sky/10'}>
                {sla.overdue ? `Overdue by ${formatMinutes(sla.minutes)}` : `${formatMinutes(sla.minutes)} left`}
              </Badge>
            )}
          </div>
          {!sla.stopped && <EscalationLine escalation={escalation} />}
          <p className="text-[11px] text-muted">
            {ticket.Priority} · counted on {bank ? formatWorkingDays(bank.Working_Days, bank.Is_24x7 === 'Y') : 'Mon – Fri'} from when the
            ticket came in; waiting on the bank does not pause it.
          </p>
        </>
      )}
    </div>
  )
}

/**
 * Live metrics for the SLA/Resolution blocks (resolution total, escalation
 * level). Refreshed every minute while the ticket is open, so a running
 * clock ticks and a new escalation level shows up.
 */
function useTicketMetrics(ticket) {
  const [metrics, setMetrics] = useState(null)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      getTicketMetrics(ticket.Ticket_Id)
        .then((res) => !cancelled && setMetrics(res.data))
        .catch(() => {})
    load()
    const timer = ticket.Clock_State !== 'STOPPED' ? setInterval(load, 60000) : null
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [ticket.Ticket_Id, ticket.Clock_State, ticket.Modified_Time])

  return metrics
}

/**
 * Resolution time: how long our side actually worked the ticket - runs
 * in "In Progress", pauses while waiting on the bank, stops when resolved.
 * Only the bank's support hours count (full day on 24x7 banks).
 */
function ResolutionSection({ ticket, bank, metrics }) {
  const clock = getClockStyle(ticket.Clock_State)
  return (
    <div className="flex flex-col gap-3 border-t border-[#EEF2F8] pt-4">
      <div className="flex items-center gap-1.5">
        <Timer className="h-3.5 w-3.5 text-primary" />
        <SectionHeading>Resolution Time</SectionHeading>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[18px] font-bold text-ink">
          {ticket.Clock_State === 'NOT_STARTED' ? '—' : formatMinutes(metrics?.resolutionMinutes ?? 0)}
        </p>
        <Badge dotClass={clock.dot} textClass={clock.text} bgClass={clock.bg}>
          {getClockLabel(ticket.Clock_State)}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Work started">{ticket.Resolution_Started_Time ? formatDateTime(ticket.Resolution_Started_Time) : '-'}</Field>
        <Field label="Resolved">{ticket.Resolved_Time ? formatDateTime(ticket.Resolved_Time) : '-'}</Field>
        {metrics?.Reopen_Count > 0 && <Field label="Reopened">{metrics.Reopen_Count}×</Field>}
      </div>
      <p className="text-[11px] text-muted">
        {ticket.Clock_State === 'NOT_STARTED' && 'Starts when the agent moves the ticket to a running status (e.g. In Progress). '}
        Counts {bank ? formatSupportHours(bank) : `${DEFAULT_SUPPORT_START_IST}–${DEFAULT_SUPPORT_END_IST} IST`}
        {bank?.Is_24x7 === 'Y' ? ' (every minute)' : ` on ${bank ? formatWorkingDays(bank.Working_Days, false) : 'Mon – Fri'} only`}.
      </p>
    </div>
  )
}

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
  const metrics = useTicketMetrics(ticket)

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
    return Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== current[key]))
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

  const status = getClockStyle(ticket.Clock_State)
  const priority = getPriorityStyle(ticket.Priority)
  const contactName = contact ? [contact.First_Name, contact.Last_Name].filter(Boolean).join(' ') : '-'
  const assigneeName = assignee ? [assignee.First_Name, assignee.Last_Name].filter(Boolean).join(' ') : null
  const ageDays = getTicketAgeDays(ticket)
  const ageingBucket = getAgeingBucketLabel(ageDays)

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
              {/* A ticket always has a status ("Unassigned" is the intake one), so no empty option. */}
              <Select
                value={form.status}
                onChange={(e) => updateField('status', e.target.value)}
                options={[
                  ...options.statuses.map((s) => ({ value: s.Value, label: s.Value })),
                  // Keep a status that was since removed from Config selectable as-is.
                  ...(form.status && !options.statuses.some((s) => s.Value === form.status) ? [{ value: form.status, label: form.status }] : []),
                ]}
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
          </div>

          <SlaSection ticket={ticket} bank={bank} escalation={metrics?.escalation} />
          <ResolutionSection ticket={ticket} bank={bank} metrics={metrics} />
          <BankSection bank={bank} />

          <div className="flex flex-col gap-4 border-t border-[#EEF2F8] pt-4">
            <SectionHeading>Ticket Information</SectionHeading>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Support team">{department?.Department_Name || '-'}</Field>
              <Field label="Product">{product?.Product_Name || '-'}</Field>
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
