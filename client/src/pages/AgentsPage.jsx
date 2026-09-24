import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, UserCog, Search } from 'lucide-react'
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
import { useAuth } from '../auth/AuthContext.jsx'
import { PERMISSIONS, ROLE_KEYS, ROLE_STYLE } from '../auth/permissions.js'
import { ApiError, getAgents, createAgent, updateAgent, deleteAgent, getDepartments, getRoles } from '../utils/api.js'

const SYSTEM_AGENT_EMAIL = 'system@sunoida.com'
const ALL_TEAMS_LABEL = 'All Teams'
const NO_TEAM_LABEL = 'Unassigned'

const emptyForm = { firstName: '', lastName: '', email: '', departmentId: '', roleId: '', status: 'Active' }

const fullNameOf = (agent) => [agent.First_Name, agent.Last_Name].filter(Boolean).join(' ')

// Manager / Admin head every team rather than sitting in one.
const teamLabelOf = (agent) => {
  if (agent.Team_Name) return agent.Team_Name
  if (agent.Role_Key === ROLE_KEYS.MANAGER || agent.Role_Key === ROLE_KEYS.ADMIN) return ALL_TEAMS_LABEL
  return NO_TEAM_LABEL
}

// Heads first, then teams alphabetically, then agents with no team; inside
// a team, by role rank (lead first) and name - the same shape as the KB sheet.
const groupRank = (label) => (label === ALL_TEAMS_LABEL ? 0 : label === NO_TEAM_LABEL ? 2 : 1)
const sortAgents = (agents) =>
  [...agents].sort((a, b) => {
    const ta = teamLabelOf(a)
    const tb = teamLabelOf(b)
    return (
      groupRank(ta) - groupRank(tb) ||
      ta.localeCompare(tb) ||
      (a.Role_Sort_Order ?? 99) - (b.Role_Sort_Order ?? 99) ||
      fullNameOf(a).localeCompare(fullNameOf(b))
    )
  })

function RoleBadge({ agent }) {
  if (!agent.Role_Key) return <span className="text-[12px] italic text-muted">No role</span>
  const style = ROLE_STYLE[agent.Role_Key] || ROLE_STYLE.TEAM_MEMBER
  return (
    <Badge textClass={style.text} bgClass={style.bg}>
      {agent.Role_Name}
    </Badge>
  )
}

function AgentFormModal({ initial, agentId, departments, roles, canSetRole, onClose, onSaved }) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const isEdit = !!agentId

  const handleSave = async () => {
    if (!form.firstName.trim() || !form.email.trim()) return
    setSaving(true)
    setError(null)
    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      departmentId: form.departmentId || null,
    }
    if (canSetRole) payload.roleId = form.roleId || null
    if (isEdit) payload.status = form.status
    try {
      if (isEdit) await updateAgent(agentId, payload)
      else await createAgent(payload)
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save agent.')
      setSaving(false)
    }
  }

  const label = (text) => <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">{text}</p>

  return (
    <Modal title={isEdit ? 'Edit agent' : 'Add agent'} onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          {label('First name')}
          <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} autoFocus />
        </div>
        <div>
          {label('Last name')}
          <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          {label('Email (used to sign in)')}
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@sunoida.com" />
        </div>
        <div>
          {label('Team')}
          <Select
            value={form.departmentId}
            onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
            options={departments.map((d) => ({ value: d.Department_Id, label: d.Department_Name }))}
            placeholder="No team"
          />
        </div>
        <div>
          {label('Role')}
          {canSetRole ? (
            <Select
              value={form.roleId}
              onChange={(e) => setForm({ ...form, roleId: e.target.value })}
              options={roles.map((r) => ({ value: r.Role_Id, label: r.Role_Name }))}
              placeholder="No role"
            />
          ) : (
            <p className="py-2 text-[12.5px] text-muted">Only the Admin controller can change roles.</p>
          )}
        </div>
        {isEdit && (
          <div>
            {label('Status')}
            <Select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              options={[
                { value: 'Active', label: 'Active' },
                { value: 'Inactive', label: 'Inactive (cannot sign in)' },
              ]}
            />
          </div>
        )}
      </div>
      {!isEdit && (
        <p className="mt-3 text-[12px] text-muted">New agents can't sign in until an admin issues them a password on the Admin page.</p>
      )}
      {error && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={saving || !form.firstName.trim() || !form.email.trim()}>
          {saving ? 'Saving…' : isEdit ? 'Save' : 'Add agent'}
        </Button>
      </div>
    </Modal>
  )
}

export default function AgentsPage() {
  const { can, agent: me } = useAuth()
  const canManage = can(PERMISSIONS.AGENTS_MANAGE)
  const canSetRole = can(PERMISSIONS.ADMIN_ACCESS)

  const [state, setState] = useState({ loading: true, error: null, agents: [] })
  const [departments, setDepartments] = useState([])
  const [roles, setRoles] = useState([])
  const [filters, setFilters] = useState({ search: '', team: '', role: '' })
  // Agents with no built-in role are leftovers from the Zoho import / Gmail
  // senders rather than the support roster, so they're hidden by default.
  const [showUnroled, setShowUnroled] = useState(false)
  const [editing, setEditing] = useState(null) // { agentId?, initial }
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const load = () => {
    setState((prev) => ({ loading: true, error: null, agents: prev.agents }))
    getAgents()
      .then((res) =>
        setState({ loading: false, error: null, agents: sortAgents(res.data.filter((a) => a.Email !== SYSTEM_AGENT_EMAIL)) }),
      )
      .catch((err) => setState({ loading: false, error: err instanceof ApiError ? err.message : 'Failed to load agents.', agents: [] }))
  }

  useEffect(() => {
    load()
    getDepartments()
      .then((res) => setDepartments(res.data))
      .catch(() => {})
    if (canManage) {
      getRoles()
        .then((res) => setRoles(res.data))
        .catch(() => {})
    }
  }, [canManage])

  const teamOptions = useMemo(
    () => [...new Set(state.agents.map(teamLabelOf))].sort((a, b) => groupRank(a) - groupRank(b) || a.localeCompare(b)),
    [state.agents],
  )
  const roleOptions = useMemo(() => {
    const seen = new Map()
    state.agents.forEach((a) => a.Role_Key && seen.set(a.Role_Key, { name: a.Role_Name, order: a.Role_Sort_Order ?? 99 }))
    return [...seen.entries()].sort((a, b) => a[1].order - b[1].order).map(([value, r]) => ({ value, label: r.name }))
  }, [state.agents])

  const unroledCount = state.agents.filter((a) => !a.Role_Key).length
  const visible = state.agents.filter((a) => {
    if (!showUnroled && !a.Role_Key && filters.role === '') return false
    const q = filters.search.trim().toLowerCase()
    if (q && !`${fullNameOf(a)} ${a.Email}`.toLowerCase().includes(q)) return false
    if (filters.team && teamLabelOf(a) !== filters.team) return false
    if (filters.role && a.Role_Key !== filters.role) return false
    return true
  })

  const confirmDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteAgent(pendingDelete.Agent_Id)
      setPendingDelete(null)
      load()
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete agent.')
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { label: 'Team Name', width: '17%' },
    { label: 'Resource Name', width: '25%' },
    { label: 'Role', width: '15%' },
    { label: 'Email', width: '25%' },
    { label: 'Status', width: '9%' },
    ...(canManage ? [{ label: '', width: '9%' }] : []),
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        title="Agents"
        subtitle="Support resources by team. Team leads assign tickets within their team; members update status."
        count={visible.length}
        actions={
          canManage && (
            <Button variant="primary" icon={Plus} onClick={() => setEditing({ initial: emptyForm })}>
              Add Agent
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          icon={Search}
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          placeholder="Search name or email"
          className="w-full sm:w-72"
        />
        <Select
          value={filters.team}
          onChange={(e) => setFilters({ ...filters, team: e.target.value })}
          options={teamOptions.map((t) => ({ value: t, label: t }))}
          placeholder="All teams"
          className="w-full sm:w-52"
        />
        <Select
          value={filters.role}
          onChange={(e) => setFilters({ ...filters, role: e.target.value })}
          options={roleOptions}
          placeholder="All roles"
          className="w-full sm:w-52"
        />
        {unroledCount > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium text-slate-600">
            <input type="checkbox" checked={showUnroled} onChange={(e) => setShowUnroled(e.target.checked)} className="h-4 w-4 accent-primary" />
            Show {unroledCount} agent{unroledCount === 1 ? '' : 's'} without a role
          </label>
        )}
      </div>

      {state.error ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-card">
          <ErrorState message={state.error} onRetry={load} />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-card">
          <table className="w-full min-w-[820px] table-fixed border-collapse text-[12.5px]">
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
                visible.map((agent, index) => {
                  const fullName = fullNameOf(agent)
                  const team = teamLabelOf(agent)
                  const startsGroup = index === 0 || teamLabelOf(visible[index - 1]) !== team
                  const isLead = agent.Role_Key === ROLE_KEYS.TEAM_LEAD || agent.Role_Key === ROLE_KEYS.MANAGER
                  const isInactive = agent.Status !== 'Active'
                  return (
                    <tr key={agent.Agent_Id} className={`${startsGroup && index > 0 ? 'border-t-2 border-[#E3E9F2]' : ''} ${isInactive ? 'opacity-60' : ''}`}>
                      <td className="px-3.5 py-2.5 align-top">
                        {startsGroup && (
                          <span className={`text-[12px] font-bold uppercase tracking-wide ${team === NO_TEAM_LABEL ? 'text-muted' : 'text-navy'}`}>
                            {team}
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar name={fullName} size={26} />
                          <span className={`truncate text-[13px] text-ink ${isLead ? 'font-extrabold' : 'font-medium'}`}>{fullName}</span>
                          {me?.agentId === agent.Agent_Id && (
                            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-primary">You</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <RoleBadge agent={agent} />
                      </td>
                      <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3.5 py-2.5 text-muted" title={agent.Email}>
                        {agent.Email}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Badge
                          textClass={isInactive ? 'text-muted' : 'text-success-dark'}
                          bgClass={isInactive ? 'bg-muted/10' : 'bg-success/10'}
                        >
                          {agent.Status}
                        </Badge>
                      </td>
                      {canManage && (
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() =>
                                setEditing({
                                  agentId: agent.Agent_Id,
                                  initial: {
                                    firstName: agent.First_Name || '',
                                    lastName: agent.Last_Name || '',
                                    email: agent.Email || '',
                                    departmentId: agent.Primary_Department_Id || '',
                                    roleId: agent.Role_Key ? agent.Role_Id : '',
                                    status: agent.Status,
                                  },
                                })
                              }
                              title="Edit"
                              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition hover:bg-slate-200 hover:text-ink"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {me?.agentId !== agent.Agent_Id && (
                              <button
                                onClick={() => setPendingDelete(agent)}
                                title="Delete"
                                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
            </tbody>
          </table>

          {!state.loading && visible.length === 0 && (
            <EmptyState icon={UserCog} title="No agents match" description="Try a different team, role or search." />
          )}
        </div>
      )}

      {editing && (
        <AgentFormModal
          initial={editing.initial}
          agentId={editing.agentId}
          departments={departments}
          roles={roles}
          canSetRole={canSetRole}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete agent"
        message={
          <>
            Delete <strong>{pendingDelete ? fullNameOf(pendingDelete) : ''}</strong>? Their sign-in is revoked. Tickets already
            assigned to them keep the record, but they won't be assignable going forward.
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
