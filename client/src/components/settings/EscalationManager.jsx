import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, Siren } from 'lucide-react'
import Input from '../ui/Input.jsx'
import Select from '../ui/Select.jsx'
import Button from '../ui/Button.jsx'
import Modal from '../ui/Modal.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import ErrorState from '../ui/ErrorState.jsx'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import { getPriorityStyle } from '../../utils/ticketMeta.js'
import { getEscalationStyle, describeEscalationOffset } from '../../utils/clockMeta.js'
import {
  ApiError,
  getPrioritySlaConfig,
  getEscalationLevels,
  createEscalationLevel,
  updateEscalationLevel,
  deleteEscalationLevel,
} from '../../utils/api.js'

const TIMINGS = [
  { value: 'before', label: 'Before due' },
  { value: 'at', label: 'At due' },
  { value: 'after', label: 'After due' },
]

const toTiming = (offsetHours) => (offsetHours < 0 ? 'before' : offsetHours === 0 ? 'at' : 'after')

/**
 * Escalation matrix: per priority, any number of levels. Level N is
 * reached a set number of hours before/at/after the ticket's SLA due date
 * (counted on the bank's working-day calendar); later levels must trigger
 * later. Escalated tickets are worked from the Escalations page. Changes
 * apply to open tickets straight away.
 */
export default function EscalationManager({ className = '' }) {
  const [state, setState] = useState({ loading: true, error: null, priorities: [], levels: [] })
  const [dialog, setDialog] = useState(null) // { mode, priority, levelId?, levelNo, timing, hours }
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const load = () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    Promise.all([getPrioritySlaConfig(), getEscalationLevels()])
      .then(([priorityRes, levelsRes]) => setState({ loading: false, error: null, priorities: priorityRes.data, levels: levelsRes.data }))
      .catch((err) =>
        setState({ loading: false, error: err instanceof ApiError ? err.message : 'Failed to load escalation matrix.', priorities: [], levels: [] }),
      )
  }

  useEffect(() => {
    load()
  }, [])

  const levelsFor = (priority) => state.levels.filter((l) => l.Priority === priority).sort((a, b) => a.Level_No - b.Level_No)

  const openAdd = (priority) => {
    const existing = levelsFor(priority)
    const nextLevelNo = existing.length ? existing[existing.length - 1].Level_No + 1 : 1
    setDialog({ mode: 'add', priority, levelNo: nextLevelNo, timing: existing.length ? 'after' : 'before', hours: '' })
    setFormError(null)
  }

  const openEdit = (level) => {
    setDialog({
      mode: 'edit',
      priority: level.Priority,
      levelId: level.Escalation_Level_Id,
      levelNo: level.Level_No,
      timing: toTiming(level.Offset_Hours),
      hours: level.Offset_Hours === 0 ? '' : String(Math.abs(level.Offset_Hours)),
    })
    setFormError(null)
  }

  const closeDialog = () => {
    setDialog(null)
    setFormError(null)
  }

  const handleSave = async () => {
    let offsetHours = 0
    if (dialog.timing !== 'at') {
      const hours = Number(dialog.hours)
      if (!hours || hours <= 0) {
        setFormError('Enter a number of hours greater than 0.')
        return
      }
      offsetHours = dialog.timing === 'before' ? -hours : hours
    }

    setSaving(true)
    setFormError(null)
    try {
      if (dialog.mode === 'add') {
        await createEscalationLevel({ priority: dialog.priority, levelNo: dialog.levelNo, offsetHours })
      } else {
        await updateEscalationLevel(dialog.levelId, offsetHours)
      }
      setDialog(null)
      load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save escalation level.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteEscalationLevel(pendingDelete.Escalation_Level_Id)
      setPendingDelete(null)
      load()
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete escalation level.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={`flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card ${className}`}>
      <div>
        <h2 className="text-[15px] font-bold text-ink-strong">Escalation matrix</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">
          When an unresolved ticket escalates, per priority. Each level is reached a set number of hours before, at or
          after the SLA due date (bank working days). Resolved and closed tickets never escalate.
        </p>
      </div>

      {state.error ? (
        <ErrorState message={state.error} onRetry={load} />
      ) : state.loading && state.priorities.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : state.priorities.length === 0 ? (
        <EmptyState title="No priorities yet" description="Add priorities under Priority SLA first." />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          {state.priorities.map(({ Priority: priority }) => {
            const style = getPriorityStyle(priority)
            const levels = levelsFor(priority)
            return (
              <div key={priority} className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-slate-50/60 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-md px-2 py-1 text-[11px] font-bold ${style.bg} ${style.text}`}>{priority}</span>
                  <button
                    onClick={() => openAdd(priority)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-primary transition hover:bg-primary/10"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add level
                  </button>
                </div>
                {levels.length === 0 ? (
                  <p className="py-2 text-center text-[12px] italic text-muted">No escalation for {priority}</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {levels.map((level) => {
                      const levelStyle = getEscalationStyle(level.Level_No)
                      return (
                        <li key={level.Escalation_Level_Id} className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-2 py-1.5">
                          <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${levelStyle.bg} ${levelStyle.text} ${levelStyle.border}`}>
                            <Siren className="h-3 w-3" />L{level.Level_No}
                          </span>
                          <span className="min-w-0 flex-1 text-[12px] font-medium leading-tight text-ink" title={describeEscalationOffset(level.Offset_Hours)}>
                            {describeEscalationOffset(level.Offset_Hours)}
                          </span>
                          <button
                            onClick={() => openEdit(level)}
                            title="Edit"
                            className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted transition hover:bg-slate-200 hover:text-ink"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setPendingDelete(level)}
                            title="Delete"
                            className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted transition hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      {dialog && (
        <Modal title={`${dialog.mode === 'add' ? 'Add' : 'Edit'} ${dialog.priority} · Level ${dialog.levelNo}`} onClose={closeDialog}>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">When</p>
                <Select value={dialog.timing} onChange={(e) => setDialog({ ...dialog, timing: e.target.value })} options={TIMINGS} />
              </div>
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Hours</p>
                <Input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={dialog.timing === 'at' ? '' : dialog.hours}
                  disabled={dialog.timing === 'at'}
                  onChange={(e) => setDialog({ ...dialog, hours: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder={dialog.timing === 'at' ? '—' : 'e.g. 4'}
                  autoFocus
                />
              </div>
            </div>
            <p className="text-[12px] text-muted">A higher level must trigger later than the level below it.</p>

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
        title="Delete escalation level"
        message={
          <>
            Delete <strong>{pendingDelete?.Priority} · Level {pendingDelete?.Level_No}</strong>? Open {pendingDelete?.Priority} tickets stop
            escalating to this level.
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
