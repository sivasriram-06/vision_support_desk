import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, UsersRound, Network } from 'lucide-react'
import PageTitle from '../components/ui/PageTitle.jsx'
import Input from '../components/ui/Input.jsx'
import Select from '../components/ui/Select.jsx'
import Button from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
import SkeletonRows from '../components/ui/SkeletonRows.jsx'
import Modal from '../components/ui/Modal.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import DepartmentManager from '../components/settings/DepartmentManager.jsx'
import { ApiError, getTeams, createTeam, updateTeam, deleteTeam, getDepartments } from '../utils/api.js'

const COLUMNS = [
  { label: 'Team Name', width: '50%' },
  { label: 'Department', width: '35%' },
  { label: '', width: '15%' },
]

export default function TeamsPage() {
  const [state, setState] = useState({ loading: true, error: null, teams: [] })
  const [departments, setDepartments] = useState([])
  const [newName, setNewName] = useState('')
  const [newDepartmentId, setNewDepartmentId] = useState('')
  const [adding, setAdding] = useState(false)
  const [formError, setFormError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [rowError, setRowError] = useState(null)
  const [showDepartmentModal, setShowDepartmentModal] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const load = () => {
    setState((prev) => ({ loading: true, error: null, teams: prev.teams }))
    getTeams()
      .then((res) => setState({ loading: false, error: null, teams: res.data }))
      .catch((err) => setState({ loading: false, error: err instanceof ApiError ? err.message : 'Failed to load teams.', teams: [] }))
  }

  const loadDepartments = () => {
    getDepartments()
      .then((res) => {
        setDepartments(res.data)
        setNewDepartmentId((prev) => {
          if (prev && res.data.some((d) => d.Department_Id === prev)) return prev
          const defaultDept = res.data.find((d) => d.Is_Default === 'Y') || res.data[0]
          return defaultDept?.Department_Id || ''
        })
      })
      .catch(() => {})
  }

  useEffect(() => {
    load()
    loadDepartments()
  }, [])

  const handleAdd = async () => {
    const teamName = newName.trim()
    if (!teamName || !newDepartmentId) return
    setAdding(true)
    setFormError(null)
    try {
      await createTeam({ teamName, departmentId: newDepartmentId })
      setNewName('')
      load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to add team.')
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (team) => {
    setEditingId(team.Team_Id)
    setEditValue(team.Team_Name)
    setRowError(null)
  }

  const handleSaveEdit = async (teamId) => {
    const teamName = editValue.trim()
    if (!teamName) return
    setRowError(null)
    try {
      await updateTeam(teamId, { teamName })
      setEditingId(null)
      load()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Failed to rename team.')
    }
  }

  const confirmDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteTeam(pendingDelete.Team_Id)
      setPendingDelete(null)
      load()
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete team.')
    } finally {
      setDeleting(false)
    }
  }

  const departmentName = (departmentId) => departments.find((d) => d.Department_Id === departmentId)?.Department_Name || '-'

  const sortedTeams = [...state.teams].sort((a, b) => {
    const deptCompare = departmentName(a.Department_Id).localeCompare(departmentName(b.Department_Id))
    return deptCompare !== 0 ? deptCompare : a.Team_Name.localeCompare(b.Team_Name)
  })

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        title="Teams"
        subtitle="Teams a ticket can be routed to."
        count={state.teams.length}
        actions={
          <Button variant="secondary" icon={Network} onClick={() => setShowDepartmentModal(true)}>
            Manage Departments
          </Button>
        }
      />

      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New team name" className="flex-1" />
          <Select
            value={newDepartmentId}
            onChange={(e) => setNewDepartmentId(e.target.value)}
            options={departments.map((d) => ({ value: d.Department_Id, label: d.Department_Name }))}
            className="sm:w-56"
          />
          <Button variant="primary" icon={Plus} onClick={handleAdd} disabled={adding || !newName.trim() || !newDepartmentId}>
            Add Team
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
                sortedTeams.map((team) => (
                  <tr key={team.Team_Id} className="even:bg-[#F8FAFD]">
                    <td className="px-3.5 py-2.5">
                      {editingId === team.Team_Id ? (
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(team.Team_Id)}
                          autoFocus
                        />
                      ) : (
                        <span className="truncate text-[13px] font-semibold text-ink">{team.Team_Name}</span>
                      )}
                    </td>
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3.5 py-2.5 text-[12.5px] text-muted">
                      {departmentName(team.Department_Id)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {editingId === team.Team_Id ? (
                          <>
                            <button
                              onClick={() => handleSaveEdit(team.Team_Id)}
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
                              onClick={() => startEdit(team)}
                              title="Rename"
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-slate-200 hover:text-ink cursor-pointer"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setPendingDelete(team)}
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
                ))}
            </tbody>
          </table>

          {!state.loading && state.teams.length === 0 && (
            <EmptyState icon={UsersRound} title="No teams yet" description="Add the first team above." />
          )}
        </div>
      )}

      {showDepartmentModal && (
        <Modal title="Manage Departments" onClose={() => setShowDepartmentModal(false)}>
          <DepartmentManager onChanged={() => { loadDepartments(); load() }} />
        </Modal>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete team"
        message={<>Delete <strong>{pendingDelete?.Team_Name}</strong>? Tickets already assigned to it keep the team on record, but it won't be selectable going forward.</>}
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
