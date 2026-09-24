import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import Input from '../ui/Input.jsx'
import Button from '../ui/Button.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import ErrorState from '../ui/ErrorState.jsx'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import { ApiError, getDepartments, createDepartment, updateDepartment, deleteDepartment } from '../../utils/api.js'

/** Add/edit/delete departments. Used inside the "Manage Support Teams" modal on the Banks page. */
export default function DepartmentManager({ onChanged }) {
  const [state, setState] = useState({ loading: true, error: null, departments: [] })
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [rowError, setRowError] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const load = () => {
    setState((prev) => ({ loading: true, error: null, departments: prev.departments }))
    getDepartments()
      .then((res) => setState({ loading: false, error: null, departments: res.data }))
      .catch((err) => setState({ loading: false, error: err instanceof ApiError ? err.message : 'Failed to load departments.', departments: [] }))
  }

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async () => {
    const departmentName = newName.trim()
    if (!departmentName) return
    setAdding(true)
    setRowError(null)
    try {
      await createDepartment({ departmentName })
      setNewName('')
      load()
      onChanged?.()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Failed to add department.')
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (department) => {
    setEditingId(department.Department_Id)
    setEditValue(department.Department_Name)
    setRowError(null)
  }

  const handleSaveEdit = async (id) => {
    const departmentName = editValue.trim()
    if (!departmentName) return
    setRowError(null)
    try {
      await updateDepartment(id, { departmentName })
      setEditingId(null)
      load()
      onChanged?.()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Failed to rename department.')
    }
  }

  const confirmDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteDepartment(pendingDelete.Department_Id)
      setPendingDelete(null)
      load()
      onChanged?.()
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete department.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Add a new department"
          className="flex-1"
        />
        <Button variant="primary" icon={Plus} onClick={handleAdd} disabled={adding || !newName.trim()}>
          Add
        </Button>
      </div>

      {rowError && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{rowError}</p>}

      {state.error ? (
        <ErrorState message={state.error} onRetry={load} />
      ) : state.loading && state.departments.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : state.departments.length === 0 ? (
        <EmptyState title="No departments yet" description="Add the first one above." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {state.departments.map((item) => (
            <li
              key={item.Department_Id}
              className="flex items-center gap-2 rounded-lg border border-border bg-slate-50/60 px-3 py-2"
            >
              {editingId === item.Department_Id ? (
                <>
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(item.Department_Id)}
                    className="flex-1"
                    autoFocus
                  />
                  <button
                    onClick={() => handleSaveEdit(item.Department_Id)}
                    title="Save"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-success-dark transition hover:bg-success/10 cursor-pointer"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    title="Cancel"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-slate-200 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-[13px] font-medium text-ink">
                    {item.Department_Name}
                    {item.Is_Default === 'Y' && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-muted">Default</span>}
                  </span>
                  <button
                    onClick={() => startEdit(item)}
                    title="Rename"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-slate-200 hover:text-ink cursor-pointer"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setPendingDelete(item)}
                    title={item.Is_Default === 'Y' ? 'The default department cannot be deleted' : 'Delete'}
                    disabled={item.Is_Default === 'Y'}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete department"
        message={<>Delete <strong>{pendingDelete?.Department_Name}</strong>? Teams and tickets already using it keep it on record, but it won't be selectable going forward.</>}
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
