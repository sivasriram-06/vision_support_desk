import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Landmark, Network, Search, X, Clock } from 'lucide-react'
import PageTitle from '../components/ui/PageTitle.jsx'
import Input from '../components/ui/Input.jsx'
import Select from '../components/ui/Select.jsx'
import Button from '../components/ui/Button.jsx'
import Badge from '../components/ui/Badge.jsx'
import Avatar from '../components/ui/Avatar.jsx'
import Modal from '../components/ui/Modal.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
import SkeletonRows from '../components/ui/SkeletonRows.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import DepartmentManager from '../components/settings/DepartmentManager.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { PERMISSIONS } from '../auth/permissions.js'
import {
  SUPPORT_LEVELS,
  getSupportLevelStyle,
  WEEKDAYS,
  DEFAULT_WORKING_DAYS,
  TIME_ZONES,
  DEFAULT_SUPPORT_START_IST,
  DEFAULT_SUPPORT_END_IST,
  formatWorkingDays,
  formatSupportHours,
  formatLocalSupportHours,
  istToLocalTime,
} from '../utils/bankMeta.js'
import { ApiError, getBanks, createBank, updateBank, deleteBank, getDepartments, getAgents, getProducts } from '../utils/api.js'

const NO_TEAM = 'No support team'

/** "= 08:00–17:00 in Africa/Nairobi" under the IST time inputs. */
const localHoursHint = (start, end, timeZone) => {
  const localStart = istToLocalTime(start, timeZone)
  const localEnd = istToLocalTime(end, timeZone)
  return localStart && localEnd ? `= ${localStart}–${localEnd} in ${timeZone}` : ''
}
const fullNameOf = (a) => [a.First_Name, a.Last_Name].filter(Boolean).join(' ')

const emptyForm = {
  bankName: '',
  departmentId: '',
  country: '',
  module: '',
  supportLevel: '',
  workingDays: DEFAULT_WORKING_DAYS,
  timeZone: 'Africa/Nairobi',
  supportStartIst: DEFAULT_SUPPORT_START_IST,
  supportEndIst: DEFAULT_SUPPORT_END_IST,
  is24x7: false,
  remarks: '',
  primaryResourceIds: [],
  secondaryResourceIds: [],
}

const formFromBank = (bank) => ({
  bankName: bank.Bank_Name || '',
  departmentId: bank.Department_Id || '',
  country: bank.Country || '',
  module: bank.Module || '',
  supportLevel: bank.Support_Level || '',
  workingDays: (bank.Working_Days || DEFAULT_WORKING_DAYS.join(',')).split(','),
  timeZone: bank.Time_Zone || 'Africa/Nairobi',
  supportStartIst: bank.Support_Start_Ist || DEFAULT_SUPPORT_START_IST,
  supportEndIst: bank.Support_End_Ist || DEFAULT_SUPPORT_END_IST,
  is24x7: bank.Is_24x7 === 'Y',
  remarks: bank.Remarks || '',
  primaryResourceIds: bank.Primary_Resources.map((a) => a.Agent_Id),
  secondaryResourceIds: bank.Secondary_Resources.map((a) => a.Agent_Id),
})

function LevelBadge({ level }) {
  if (!level) return <span className="text-muted">—</span>
  const style = getSupportLevelStyle(level)
  return (
    <Badge textClass={style.text} bgClass={style.bg} className={`border ${style.border}`}>
      {level}
    </Badge>
  )
}

function ResourceList({ agents }) {
  if (agents.length === 0) return <span className="text-muted">—</span>
  return (
    <div className="flex flex-col gap-1">
      {agents.map((a) => (
        <div key={a.Agent_Id} className="flex min-w-0 items-center gap-1.5">
          <Avatar name={fullNameOf(a)} size={20} />
          <span className="truncate text-[12.5px] font-medium text-ink">{fullNameOf(a)}</span>
        </div>
      ))}
    </div>
  )
}

/** Chips of picked agents + a dropdown to add more. The bank's own support team is listed first. */
function ResourcePicker({ label, value, onChange, agents, teamId, excludeIds = [] }) {
  const selected = value.map((id) => agents.find((a) => a.Agent_Id === id)).filter(Boolean)
  const available = agents
    .filter((a) => a.Status === 'Active' && !value.includes(a.Agent_Id) && !excludeIds.includes(a.Agent_Id))
    .sort((a, b) => Number(b.Primary_Department_Id === teamId) - Number(a.Primary_Department_Id === teamId) || fullNameOf(a).localeCompare(fullNameOf(b)))

  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-[9px] border border-border bg-white p-1.5">
        {selected.map((a) => (
          <span key={a.Agent_Id} className="inline-flex items-center gap-1 rounded-md bg-navy/5 py-0.5 pl-1 pr-1.5 text-[12px] font-semibold text-navy">
            <Avatar name={fullNameOf(a)} size={18} />
            {fullNameOf(a)}
            <button
              type="button"
              onClick={() => onChange(value.filter((id) => id !== a.Agent_Id))}
              title="Remove"
              className="ml-0.5 cursor-pointer rounded text-navy/50 hover:text-danger"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <select
          value=""
          onChange={(e) => e.target.value && onChange([...value, e.target.value])}
          className="min-w-[140px] flex-1 cursor-pointer bg-transparent px-1 py-1 text-[12.5px] text-slate-500 outline-none"
        >
          <option value="">+ Add resource…</option>
          {available.map((a) => (
            <option key={a.Agent_Id} value={a.Agent_Id}>
              {fullNameOf(a)}
              {a.Team_Name ? ` — ${a.Team_Name}` : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function BankFormModal({ bankId, initial, departments, agents, products, onClose, onSaved }) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))
  const field = (text) => <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">{text}</p>

  // Keep a module value that isn't (or is no longer) a product selectable.
  const moduleOptions = [...new Set([...products.map((p) => p.Product_Name), form.module].filter(Boolean))].map((m) => ({ value: m, label: m }))

  const handleSave = async () => {
    if (!form.bankName.trim() || !form.departmentId) return
    if (!form.is24x7 && form.workingDays.length === 0) {
      setError('Pick at least one working day, or tick 24x7.')
      return
    }
    if (!form.supportStartIst || !form.supportEndIst || form.supportEndIst <= form.supportStartIst) {
      setError('Set support hours that end after they start.')
      return
    }
    setSaving(true)
    setError(null)
    const payload = { ...form, bankName: form.bankName.trim(), supportLevel: form.supportLevel || null }
    try {
      if (bankId) await updateBank(bankId, payload)
      else await createBank(payload)
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save bank.')
      setSaving(false)
    }
  }

  return (
    <Modal title={bankId ? `Edit bank — ${initial.bankName}` : 'Add bank'} onClose={onClose} className="max-w-3xl">
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            {field('Bank name')}
            <Input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="e.g. I&M Kenya" autoFocus />
          </div>
          <div>
            {field('Country')}
            <Input value={form.country} onChange={(e) => set('country', e.target.value)} placeholder="e.g. Kenya" />
          </div>
          <div>
            {field('Support team')}
            <Select
              value={form.departmentId}
              onChange={(e) => set('departmentId', e.target.value)}
              options={departments.map((d) => ({ value: d.Department_Id, label: d.Department_Name }))}
              placeholder="Select team"
            />
          </div>
          <div>
            {field('Module')}
            <Select value={form.module} onChange={(e) => set('module', e.target.value)} options={moduleOptions} placeholder="Not set" />
          </div>
          <div>
            {field('Support level')}
            <Select
              value={form.supportLevel}
              onChange={(e) => set('supportLevel', e.target.value)}
              options={SUPPORT_LEVELS.map((l) => ({ value: l, label: l }))}
              placeholder="Not set"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-[#EEF2F8] pt-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            {field('Working days (SLA and resolution time skip the other days)')}
            <div className="flex flex-wrap items-center gap-1.5">
              {WEEKDAYS.map((day) => {
                const on = form.is24x7 || form.workingDays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={form.is24x7}
                    onClick={() =>
                      set('workingDays', on ? form.workingDays.filter((d) => d !== day) : [...form.workingDays, day])
                    }
                    className={`h-8 min-w-[46px] cursor-pointer rounded-lg border px-2 text-[12px] font-bold transition disabled:cursor-not-allowed ${
                      on ? 'border-primary bg-primary text-white' : 'border-border bg-white text-slate-500 hover:border-primary/50'
                    }`}
                  >
                    {day.charAt(0) + day.slice(1).toLowerCase()}
                  </button>
                )
              })}
              <label className="ml-2 flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink">
                <input type="checkbox" checked={form.is24x7} onChange={(e) => set('is24x7', e.target.checked)} className="h-4 w-4 accent-primary" />
                24x7 support (every day counts)
              </label>
            </div>
          </div>
          <div>
            {field('Bank time zone')}
            <Select value={form.timeZone} onChange={(e) => set('timeZone', e.target.value)} options={TIME_ZONES} />
          </div>
          <div className="sm:col-span-2">
            {field('Support hours, IST (resolution time counts only inside this window)')}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="time"
                required
                value={form.supportStartIst}
                disabled={form.is24x7}
                onChange={(e) => set('supportStartIst', e.target.value)}
                className="w-32"
              />
              <span className="text-[13px] text-muted">to</span>
              <Input
                type="time"
                required
                value={form.supportEndIst}
                disabled={form.is24x7}
                onChange={(e) => set('supportEndIst', e.target.value)}
                className="w-32"
              />
              <span className="text-[12px] text-muted">
                {form.is24x7
                  ? 'Full day, all days (24x7)'
                  : localHoursHint(form.supportStartIst, form.supportEndIst, form.timeZone)}
              </span>
            </div>
          </div>
          <div className="sm:col-span-3">
            {field('Remarks')}
            <Input value={form.remarks} onChange={(e) => set('remarks', e.target.value)} placeholder="e.g. 24x7 support for Priority 1 tickets" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-[#EEF2F8] pt-4 sm:grid-cols-2">
          <ResourcePicker
            label="Primary resource(s)"
            value={form.primaryResourceIds}
            onChange={(ids) => set('primaryResourceIds', ids)}
            agents={agents}
            teamId={form.departmentId}
            excludeIds={form.secondaryResourceIds}
          />
          <ResourcePicker
            label="Secondary resource(s)"
            value={form.secondaryResourceIds}
            onChange={(ids) => set('secondaryResourceIds', ids)}
            agents={agents}
            teamId={form.departmentId}
            excludeIds={form.primaryResourceIds}
          />
        </div>

        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || !form.bankName.trim() || !form.departmentId}>
            {saving ? 'Saving…' : bankId ? 'Save' : 'Add bank'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function BanksPage() {
  const { can } = useAuth()
  const canManage = can(PERMISSIONS.TEAMS_MANAGE)

  const [state, setState] = useState({ loading: true, error: null, banks: [] })
  const [departments, setDepartments] = useState([])
  const [agents, setAgents] = useState([])
  const [products, setProducts] = useState([])
  const [filters, setFilters] = useState({ search: '', team: '', level: '', module: '' })
  const [editing, setEditing] = useState(null) // { bankId?, initial }
  const [showTeamsModal, setShowTeamsModal] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const load = () => {
    setState((prev) => ({ loading: true, error: null, banks: prev.banks }))
    getBanks()
      .then((res) => setState({ loading: false, error: null, banks: res.data }))
      .catch((err) => setState({ loading: false, error: err instanceof ApiError ? err.message : 'Failed to load banks.', banks: [] }))
  }
  const loadDepartments = () =>
    getDepartments()
      .then((res) => setDepartments(res.data))
      .catch(() => {})

  useEffect(() => {
    load()
    loadDepartments()
    if (canManage) {
      getAgents()
        .then((res) => setAgents(res.data.filter((a) => a.Role_Key)))
        .catch(() => {})
      getProducts()
        .then((res) => setProducts(res.data))
        .catch(() => {})
    }
  }, [canManage])

  const teamLabel = (bank) => bank.Support_Team_Name || NO_TEAM
  const teamOptions = useMemo(() => [...new Set(state.banks.map(teamLabel))].sort(), [state.banks])
  const moduleOptions = useMemo(() => [...new Set(state.banks.map((b) => b.Module).filter(Boolean))].sort(), [state.banks])

  const visible = state.banks
    .filter((b) => {
      const q = filters.search.trim().toLowerCase()
      const people = [...b.Primary_Resources, ...b.Secondary_Resources].map(fullNameOf).join(' ')
      if (q && !`${b.Bank_Name} ${b.Country || ''} ${people}`.toLowerCase().includes(q)) return false
      if (filters.team && teamLabel(b) !== filters.team) return false
      if (filters.level && (b.Support_Level || '') !== filters.level) return false
      if (filters.module && b.Module !== filters.module) return false
      return true
    })
    .sort((a, b) => {
      const ta = teamLabel(a)
      const tb = teamLabel(b)
      return (ta === NO_TEAM) - (tb === NO_TEAM) || ta.localeCompare(tb) || a.Bank_Name.localeCompare(b.Bank_Name)
    })

  const levelCounts = SUPPORT_LEVELS.map((level) => ({ level, count: state.banks.filter((b) => b.Support_Level === level).length }))

  const confirmDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteBank(pendingDelete.Bank_Id)
      setPendingDelete(null)
      load()
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete bank.')
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { label: 'Bank', width: '17%' },
    { label: 'Module', width: '9%' },
    { label: 'Level', width: '9%' },
    { label: 'Working Days', width: '10%' },
    { label: 'Support Hours (IST / Local)', width: '17%' },
    { label: 'Primary Resource', width: '15%' },
    { label: 'Secondary Resource', width: '15%' },
    ...(canManage ? [{ label: '', width: '8%' }] : []),
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        title="Banks"
        subtitle="Which support team works each bank, its support level and hours, and who is primary / secondary."
        count={visible.length}
        actions={
          canManage && (
            <>
              <Button variant="secondary" icon={Network} onClick={() => setShowTeamsModal(true)}>
                Manage Support Teams
              </Button>
              <Button variant="primary" icon={Plus} onClick={() => setEditing({ initial: emptyForm })}>
                Add Bank
              </Button>
            </>
          )
        }
      />

      <div className="flex flex-wrap gap-2">
        {levelCounts.map(({ level, count }) => {
          const style = getSupportLevelStyle(level)
          const active = filters.level === level
          return (
            <button
              key={level}
              onClick={() => setFilters({ ...filters, level: active ? '' : level })}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                active ? `${style.bg} ${style.border} ${style.text}` : 'border-border bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${style.dot}`} />
              {level}
              <span className="font-mono text-[11.5px] opacity-70">{count}</span>
            </button>
          )
        })}
        <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-600">
          <Clock className="h-3.5 w-3.5 text-primary" />
          24x7
          <span className="font-mono text-[11.5px] opacity-70">{state.banks.filter((b) => b.Is_24x7 === 'Y').length}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          icon={Search}
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          placeholder="Search bank, country or resource"
          className="w-full sm:w-72"
        />
        <Select
          value={filters.team}
          onChange={(e) => setFilters({ ...filters, team: e.target.value })}
          options={teamOptions.map((t) => ({ value: t, label: t }))}
          placeholder="All support teams"
          className="w-full sm:w-52"
        />
        <Select
          value={filters.module}
          onChange={(e) => setFilters({ ...filters, module: e.target.value })}
          options={moduleOptions.map((m) => ({ value: m, label: m }))}
          placeholder="All modules"
          className="w-full sm:w-44"
        />
      </div>

      {state.error ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-card">
          <ErrorState message={state.error} onRetry={load} />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-card">
          <table className="w-full min-w-[1080px] table-fixed border-collapse text-[12.5px]">
            <colgroup>
              {columns.map((col, i) => (
                <col key={i} style={{ width: col.width }} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-gradient-to-b from-[#F4F7FB] to-[#E9EEF6]">
                {columns.map((col, i) => (
                  <th
                    key={i}
                    className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-border-strong px-3.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-700"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.loading && <SkeletonRows columns={columns.length} />}
              {!state.loading &&
                visible.map((bank, index) => {
                  const team = teamLabel(bank)
                  const startsGroup = index === 0 || teamLabel(visible[index - 1]) !== team
                  const groupSize = visible.filter((b) => teamLabel(b) === team).length
                  return [
                    startsGroup && (
                      <tr key={`group-${team}`} className="bg-[#F8FAFD]">
                        <td colSpan={columns.length} className="border-y border-[#E3E9F2] px-3.5 py-2">
                          <span className={`text-[11px] font-bold uppercase tracking-wider ${team === NO_TEAM ? 'text-muted' : 'text-navy'}`}>{team}</span>
                          <span className="ml-2 font-mono text-[11px] text-muted">{groupSize}</span>
                        </td>
                      </tr>
                    ),
                    <tr key={bank.Bank_Id} className="border-t border-[#EEF2F8] align-top">
                      <td className="px-3.5 py-2.5">
                        <p className="truncate text-[13px] font-semibold text-ink" title={bank.Bank_Name}>
                          {bank.Bank_Name}
                        </p>
                        {bank.Country && <p className="truncate text-[11.5px] text-muted">{bank.Country}</p>}
                        {bank.Remarks && (
                          <p className="mt-0.5 line-clamp-2 text-[11px] italic text-slate-500" title={bank.Remarks}>
                            {bank.Remarks}
                          </p>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-600">{bank.Module || '—'}</td>
                      <td className="px-3.5 py-2.5">
                        <LevelBadge level={bank.Support_Level} />
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-600">
                        {formatWorkingDays(bank.Working_Days, false)}
                        {bank.Is_24x7 === 'Y' && (
                          <span className="mt-1 flex">
                            <Badge textClass="text-primary-dark" bgClass="bg-primary/10">
                              24x7
                            </Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <p className="whitespace-nowrap text-ink">{formatSupportHours(bank)}</p>
                        {formatLocalSupportHours(bank) && (
                          <p className="whitespace-nowrap text-[11.5px] text-muted">{formatLocalSupportHours(bank)}</p>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <ResourceList agents={bank.Primary_Resources} />
                      </td>
                      <td className="px-3.5 py-2.5">
                        <ResourceList agents={bank.Secondary_Resources} />
                      </td>
                      {canManage && (
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setEditing({ bankId: bank.Bank_Id, initial: formFromBank(bank) })}
                              title="Edit"
                              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition hover:bg-slate-200 hover:text-ink"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setPendingDelete(bank)}
                              title="Delete"
                              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>,
                  ]
                })}
            </tbody>
          </table>

          {!state.loading && visible.length === 0 && (
            <EmptyState icon={Landmark} title="No banks match" description="Try a different team, level or search." />
          )}
        </div>
      )}

      {editing && (
        <BankFormModal
          bankId={editing.bankId}
          initial={editing.initial}
          departments={departments}
          agents={agents}
          products={products}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}

      {showTeamsModal && (
        <Modal title="Manage Support Teams" onClose={() => setShowTeamsModal(false)}>
          <DepartmentManager
            onChanged={() => {
              loadDepartments()
              load()
            }}
          />
        </Modal>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete bank"
        message={
          <>
            Delete <strong>{pendingDelete?.Bank_Name}</strong>? Tickets already linked to it keep the bank on record, but it won't be
            selectable going forward.
          </>
        }
        loading={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => {
          setPendingDelete(null)
          setDeleteError(null)
        }}
      />
    </div>
  )
}
