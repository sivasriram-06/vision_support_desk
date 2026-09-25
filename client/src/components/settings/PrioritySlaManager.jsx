import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check } from 'lucide-react'
import Input from '../ui/Input.jsx'
import Button from '../ui/Button.jsx'
import Modal from '../ui/Modal.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import ErrorState from '../ui/ErrorState.jsx'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import { getPriorityStyle } from '../../utils/ticketMeta.js'
import {
  ApiError,
  getPrioritySlaConfig,
  createPrioritySlaConfig,
  upsertPrioritySlaConfig,
  deletePrioritySlaConfig,
} from '../../utils/api.js'

const formatHours = (hours) => {
  if (!hours) return 'Not set'
  if (hours % 24 === 0 && hours >= 24) return `${hours} hrs (${hours / 24} day${hours / 24 === 1 ? '' : 's'})`
  return `${hours} hrs`
}

/**
 * Admin-managed list of priorities and their SLA target (in hours).
 * Setting/changing hours here doesn't touch existing tickets retroactively
 * - it only affects the Response Due date calculated the next time a
 * ticket's priority is set (see server/src/services/ticket.service.js).
 */
export default function PrioritySlaManager({ className = '' }) {
  const [state, setState] = useState({ loading: true, error: null, rows: [] })
  const [dialog, setDialog] = useState(null) // { mode: 'add' | 'edit', priority?, priorityInput, hoursInput }
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const load = () => {
    setState((prev) => ({ loading: true, error: null, rows: prev.rows }))
    getPrioritySlaConfig()
      .then((res) => setState({ loading: false, error: null, rows: res.data }))
      .catch((err) => setState({ loading: false, error: err instanceof ApiError ? err.message : 'Failed to load SLA config.', rows: [] }))
  }

  useEffect(() => {
    load()
  }, [])

  const openAdd = () => {
    setDialog({ mode: 'add', priorityInput: '', hoursInput: '' })
    setFormError(null)
  }

  const openEdit = (row) => {
    setDialog({ mode: 'edit', priority: row.Priority, priorityInput: row.Priority, hoursInput: row.Sla_Hours ?? '' })
    setFormError(null)
  }

  const closeDialog = () => {
    setDialog(null)
    setFormError(null)
  }

  const handleSave = async () => {
    const slaHours = Number(dialog.hoursInput)
    if (!slaHours || slaHours <= 0) {
      setFormError('Enter a number of hours greater than 0.')
      return
    }
    if (dialog.mode === 'add' && !dialog.priorityInput.trim()) {
      setFormError('Enter a name for the priority.')
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      if (dialog.mode === 'add') {
        await createPrioritySlaConfig(dialog.priorityInput.trim(), slaHours)
      } else {
        await upsertPrioritySlaConfig(dialog.priority, slaHours)
      }
      setDialog(null)
      load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save priority.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deletePrioritySlaConfig(pendingDelete.Priority)
      setPendingDelete(null)
      load()
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete priority.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={`flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-ink-strong">Priority SLA</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Priorities agents can set on a ticket, and the response-due target (in hours) for each. A ticket's due
            date recalculates automatically from its Created time whenever its priority is set.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={openAdd} className="shrink-0">
          Add
        </Button>
      </div>

      {state.error ? (
        <ErrorState message={state.error} onRetry={load} />
      ) : state.loading && state.rows.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : state.rows.length === 0 ? (
        <EmptyState title="No priorities yet" description="Add the first one above." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {state.rows.map((row) => {
            const style = getPriorityStyle(row.Priority)
            return (
              <li
                key={row.Priority}
                className="flex items-center gap-2 rounded-lg border border-border bg-slate-50/60 px-3 py-2"
              >
                <span className={`shrink-0 rounded-md px-2 py-1 text-center text-[11px] font-bold ${style.bg} ${style.text}`}>
                  {row.Priority}
                </span>
                <span className={`flex-1 truncate text-[13px] font-medium ${row.Sla_Hours ? 'text-ink' : 'italic text-muted'}`}>
                  {formatHours(row.Sla_Hours)}
                </span>
                <button
                  onClick={() => openEdit(row)}
                  title="Edit"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-slate-200 hover:text-ink cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setPendingDelete(row)}
                  title="Delete"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {dialog && (
        <Modal title={dialog.mode === 'add' ? 'Add priority' : `Edit ${dialog.priority}`} onClose={closeDialog}>
          <div className="flex flex-col gap-3">
            {dialog.mode === 'add' && (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Priority name</p>
                <Input
                  value={dialog.priorityInput}
                  onChange={(e) => setDialog({ ...dialog, priorityInput: e.target.value })}
                  placeholder="e.g. P5 or Urgent"
                  autoFocus
                />
              </div>
            )}
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Hours to respond</p>
              <Input
                type="number"
                min="1"
                value={dialog.hoursInput}
                onChange={(e) => setDialog({ ...dialog, hoursInput: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder="e.g. 24"
                autoFocus={dialog.mode === 'edit'}
              />
            </div>

            {formError && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{formError}</p>}

            <div className="mt-1 flex justify-end gap-2">
              <Button variant="secondary" onClick={closeDialog} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" icon={Check} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete priority"
        message={<>Delete <strong>{pendingDelete?.Priority}</strong>? Tickets already using it keep the value, but it won't be offered going forward.</>}
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
