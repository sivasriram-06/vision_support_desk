import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, UserCog } from 'lucide-react'
import PageTitle from '../components/ui/PageTitle.jsx'
import Input from '../components/ui/Input.jsx'
import Select from '../components/ui/Select.jsx'
import Button from '../components/ui/Button.jsx'
import Badge from '../components/ui/Badge.jsx'
import Avatar from '../components/ui/Avatar.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
import SkeletonRows from '../components/ui/SkeletonRows.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import { ApiError, getAgents, createAgent, updateAgent, deleteAgent, getDepartments } from '../utils/api.js'

const COLUMNS = [
  { label: 'Agent', width: '32%' },
  { label: 'Email', width: '28%' },
  { label: 'Department', width: '18%' },
  { label: 'Status', width: '10%' },
  { label: '', width: '12%' },
]

const emptyForm = { firstName: '', lastName: '', email: '', departmentId: '' }

export default function AgentsPage() {
  const [state, setState] = useState({ loading: true, error: null, agents: [] })
  const [departments, setDepartments] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [adding, setAdding] = useState(false)
  const [formError, setFormError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [rowError, setRowError] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const load = () => {
    setState((prev) => ({ loading: true, error: null, agents: prev.agents }))
    getAgents()
      .then((res) => setState({ loading: false, error: null, agents: res.data }))
      .catch((err) => setState({ loading: false, error: err instanceof ApiError ? err.message : 'Failed to load agents.', agents: [] }))
  }

  useEffect(() => {
    load()
    getDepartments()
      .then((res) => setDepartments(res.data))
      .catch(() => {})
  }, [])

  const handleAdd = async () => {
    const firstName = form.firstName.trim()
    const lastName = form.lastName.trim()
    const email = form.email.trim()
    if (!firstName || !lastName || !email) return
    setAdding(true)
    setFormError(null)
    try {
      await createAgent({ firstName, lastName, email, departmentId: form.departmentId || null })
      setForm(emptyForm)
      load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to add agent.')
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (agent) => {
    setEditingId(agent.Agent_Id)
    setEditForm({
      firstName: agent.First_Name || '',
      lastName: agent.Last_Name || '',
      departmentId: agent.Primary_Department_Id || '',
      status: agent.Status,
    })
    setRowError(null)
  }

  const handleSaveEdit = async (agentId) => {
    const firstName = editForm.firstName.trim()
    const lastName = editForm.lastName.trim()
    if (!firstName || !lastName) return
    setRowError(null)
    try {
      await updateAgent(agentId, {
        firstName,
        lastName,
        departmentId: editForm.departmentId || null,
        status: editForm.status,
      })
      setEditingId(null)
      load()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Failed to update agent.')
    }
  }

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

  const departmentName = (departmentId) => departments.find((d) => d.Department_Id === departmentId)?.Department_Name || '-'
  const departmentOptions = departments.map((d) => ({ value: d.Department_Id, label: d.Department_Name }))

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Team Members" subtitle="Agents who can be assigned tickets." count={state.agents.length} />

      <div className="rounded-lg border border-sky/25 bg-sky/5 px-4 py-2.5 text-[12.5px] text-sky-dark">
        This is a lightweight roster for now - added agents can be assigned tickets, but sign-in/roles/permissions aren't wired up
        yet. That's a planned future enhancement.
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="First name" />
          <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Last name" />
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email"
          />
          <Select
            value={form.departmentId}
            onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
            options={departmentOptions}
            placeholder="No department"
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            variant="primary"
            icon={Plus}
            onClick={handleAdd}
            disabled={adding || !form.firstName.trim() || !form.lastName.trim() || !form.email.trim()}
          >
            Add Agent
          </Button>
        </div>
        {formError && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{formError}</p>}
      </div>

      {rowError && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{rowError}</p>}

      {state.error ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-card">
          <ErrorState message={state.error} onRetry={load} />
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
              {state.loading && <SkeletonRows columns={COLUMNS.length} />}
              {!state.loading &&
                state.agents.map((agent) => {
                  const fullName = [agent.First_Name, agent.Last_Name].filter(Boolean).join(' ')
                  const isEditing = editingId === agent.Agent_Id
                  return (
                    <tr key={agent.Agent_Id} className="even:bg-[#F8FAFD]">
                      <td className="px-3.5 py-2.5">
                        {isEditing ? (
                          <div className="flex gap-1.5">
                            <Input
                              value={editForm.firstName}
                              onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                              placeholder="First name"
                              className="flex-1"
                              autoFocus
                            />
                            <Input
                              value={editForm.lastName}
                              onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                              placeholder="Last name"
                              className="flex-1"
                            />
                          </div>
                        ) : (
                          <div className="flex min-w-0 items-center gap-2">
                            <Avatar name={fullName} size={26} />
                            <span className="truncate text-[13px] font-semibold text-ink">{fullName}</span>
                          </div>
                        )}
                      </td>
                      <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3.5 py-2.5 text-[12.5px] text-muted">
                        {agent.Email}
                      </td>
                      <td className="px-3.5 py-2.5">
                        {isEditing ? (
                          <Select
                            value={editForm.departmentId}
                            onChange={(e) => setEditForm({ ...editForm, departmentId: e.target.value })}
                            options={departmentOptions}
                            placeholder="None"
                          />
                        ) : (
                          <span className="text-[12.5px] text-muted">{departmentName(agent.Primary_Department_Id)}</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5">
                        {isEditing ? (
                          <Select
                            value={editForm.status}
                            onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                            options={[
                              { value: 'Active', label: 'Active' },
                              { value: 'Inactive', label: 'Inactive' },
                            ]}
                          />
                        ) : (
                          <Badge
                            textClass={agent.Status === 'Active' ? 'text-success-dark' : 'text-muted'}
                            bgClass={agent.Status === 'Active' ? 'bg-success/10' : 'bg-muted/10'}
                          >
                            {agent.Status}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(agent.Agent_Id)}
                                title="Save"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-success-dark transition hover:bg-success/10 cursor-pointer"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                title="Cancel"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-slate-200 cursor-pointer"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(agent)}
                                title="Edit"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-slate-200 hover:text-ink cursor-pointer"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setPendingDelete(agent)}
                                title="Delete"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>

          {!state.loading && state.agents.length === 0 && (
            <EmptyState icon={UserCog} title="No agents yet" description="Add the first agent above." />
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete agent"
        message={
          <>
            Delete <strong>{[pendingDelete?.First_Name, pendingDelete?.Last_Name].filter(Boolean).join(' ')}</strong>?
            Tickets already assigned to them keep the record, but they won't be assignable going forward.
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
