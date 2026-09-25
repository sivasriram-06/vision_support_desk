import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import Input from '../ui/Input.jsx'
import Select from '../ui/Select.jsx'
import Badge from '../ui/Badge.jsx'
import Button from '../ui/Button.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import ErrorState from '../ui/ErrorState.jsx'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import { ApiError, getPicklistValues, createPicklistValue, updatePicklistValue, deletePicklistValue } from '../../utils/api.js'
import { CLOCK_BEHAVIOURS, getClockStyle, getClockLabel } from '../../utils/clockMeta.js'

const CLOCK_OPTIONS = CLOCK_BEHAVIOURS.map((c) => ({ value: c.value, label: `Clock: ${c.label}` }))

/**
 * CRUD list for one picklist field. For Status, each value also carries its
 * resolution-clock behaviour (Not started / Running / Paused / Stopped).
 */
export default function PicklistManager({ field, label, className = '' }) {
  const isStatus = field === 'STATUS'
  const [state, setState] = useState({ loading: true, error: null, values: [] })
  const [newValue, setNewValue] = useState('')
  const [newClock, setNewClock] = useState('NOT_STARTED')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [editClock, setEditClock] = useState('NOT_STARTED')
  const [rowError, setRowError] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const load = () => {
    setState((prev) => ({ loading: true, error: null, values: prev.values }))
    getPicklistValues(field)
      .then((res) => setState({ loading: false, error: null, values: res.data }))
      .catch((err) => setState({ loading: false, error: err instanceof ApiError ? err.message : 'Failed to load values.', values: [] }))
  }

  useEffect(() => {
    load()
    setEditingId(null)
    setNewValue('')
    setRowError(null)
  }, [field])

  const handleAdd = async () => {
    const value = newValue.trim()
    if (!value) return
    setAdding(true)
    setRowError(null)
    try {
      await createPicklistValue(isStatus ? { field, value, clockBehaviour: newClock } : { field, value })
      setNewValue('')
      setNewClock('NOT_STARTED')
      load()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Failed to add value.')
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (item) => {
    setEditingId(item.Picklist_Value_Id)
    setEditValue(item.Value)
    setEditClock(item.Clock_Behaviour || 'NOT_STARTED')
    setRowError(null)
  }

  const handleSaveEdit = async (id) => {
    const value = editValue.trim()
    if (!value) return
    setRowError(null)
    try {
      // Name and (for Status) clock behaviour are saved together from the edit row.
      await updatePicklistValue(id, isStatus ? { value, clockBehaviour: editClock } : { value })
      setEditingId(null)
      load()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Failed to update value.')
    }
  }

  const confirmDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deletePicklistValue(pendingDelete.Picklist_Value_Id)
      setPendingDelete(null)
      load()
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete value.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={`flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card ${className}`}>
      <div>
        <h2 className="text-[15px] font-bold text-ink-strong">{label}</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {field === 'TEAM_TYPE'
            ? 'Kinds of team, set on each team under Banks → Manage Support Teams. Support teams are assigned by their team lead; any other type (e.g. Product) can be pulled into a ticket by anyone.'
            : `Values agents can pick for the ticket's ${label.toLowerCase()} field.`}
          {isStatus && (
            <>
              {' '}
              Each status also sets the <strong className="text-ink">resolution clock</strong>: Running while our side works,
              Paused while waiting on the bank, Stopped once resolved. The SLA due date never pauses.
            </>
          )}
        </p>
        {isStatus && (
          <ul className="mt-2 grid grid-cols-1 gap-1 text-[11.5px] text-slate-500 sm:grid-cols-2">
            {CLOCK_BEHAVIOURS.map((c) => (
              <li key={c.value} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${getClockStyle(c.value).dot}`} />
                <strong className="text-ink">{c.label}</strong> — {c.hint}
              </li>
            ))}
            <li className="sm:col-span-2 text-muted">
              Changing a status's clock applies to tickets already in it from that moment; renaming a status updates those tickets too.
            </li>
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={`Add a new ${label.toLowerCase()} value`}
          className="flex-1"
        />
        {isStatus && (
          <Select
            value={newClock}
            onChange={(e) => setNewClock(e.target.value)}
            options={CLOCK_OPTIONS}
            className="w-40 shrink-0"
            title="What the resolution clock does while a ticket is in this status"
          />
        )}
        <Button variant="primary" icon={Plus} onClick={handleAdd} disabled={adding || !newValue.trim()}>
          Add
        </Button>
      </div>

      {rowError && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{rowError}</p>}

      {state.error ? (
        <ErrorState message={state.error} onRetry={load} />
      ) : state.loading && state.values.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : state.values.length === 0 ? (
        <EmptyState title={`No ${label.toLowerCase()} values yet`} description="Add the first one above." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {state.values.map((item) => (
            <li
              key={item.Picklist_Value_Id}
              className="flex items-center gap-2 rounded-lg border border-border bg-slate-50/60 px-3 py-2"
            >
              {editingId === item.Picklist_Value_Id ? (
                <>
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(item.Picklist_Value_Id)}
                    className="flex-1"
                    autoFocus
                  />
                  {isStatus && (
                    <Select
                      value={editClock}
                      onChange={(e) => setEditClock(e.target.value)}
                      options={CLOCK_OPTIONS}
                      className="w-40 shrink-0"
                    />
                  )}
                  <button
                    onClick={() => handleSaveEdit(item.Picklist_Value_Id)}
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
                  <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-[13px] font-medium text-ink">
                    <span className="truncate">{item.Value}</span>
                  </span>
                  {isStatus && (
                    <Badge
                      dotClass={getClockStyle(item.Clock_Behaviour).dot}
                      textClass={getClockStyle(item.Clock_Behaviour).text}
                      bgClass={getClockStyle(item.Clock_Behaviour).bg}
                      className="shrink-0"
                    >
                      {getClockLabel(item.Clock_Behaviour)}
                    </Badge>
                  )}
                  <button
                    onClick={() => startEdit(item)}
                    title="Edit"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-slate-200 hover:text-ink cursor-pointer"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setPendingDelete(item)}
                    title="Delete"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger cursor-pointer"
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
        title={`Delete ${label.toLowerCase()} value`}
        message={<>Delete <strong>{pendingDelete?.Value}</strong>? Tickets already using it keep the value, but it won't be offered going forward.</>}
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
