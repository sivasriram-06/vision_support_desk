import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight } from 'lucide-react'
import Input from '../ui/Input.jsx'
import Button from '../ui/Button.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import ErrorState from '../ui/ErrorState.jsx'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import { ApiError, getPicklistValues, createPicklistValue, updatePicklistValue, deletePicklistValue } from '../../utils/api.js'

/**
 * Classification (ticket type, e.g. "Problem") owns many Categories
 * (sub-classification, e.g. "Application" / "Process" / "People") - the
 * same Category text can validly repeat under different Classifications, so
 * they're grouped and managed here instead of as a flat picklist.
 */
export default function ClassificationManager() {
  const [state, setState] = useState({ loading: true, error: null, classifications: [], categories: [] })
  const [expanded, setExpanded] = useState(() => new Set())
  const [newClassification, setNewClassification] = useState('')
  const [addingClassification, setAddingClassification] = useState(false)
  const [newCategoryInputs, setNewCategoryInputs] = useState({})
  const [addingCategoryFor, setAddingCategoryFor] = useState(null)
  const [editing, setEditing] = useState(null) // { kind: 'classification' | 'category', id, value }
  const [rowError, setRowError] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null) // { kind: 'classification' | 'category', item }
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const load = () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    Promise.all([getPicklistValues('CLASSIFICATION'), getPicklistValues('CATEGORY')])
      .then(([classificationsRes, categoriesRes]) =>
        setState({ loading: false, error: null, classifications: classificationsRes.data, categories: categoriesRes.data }),
      )
      .catch((err) =>
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof ApiError ? err.message : 'Failed to load classifications.',
        })),
      )
  }

  useEffect(() => {
    load()
  }, [])

  const categoriesFor = (classificationValue) => state.categories.filter((c) => c.Parent_Value === classificationValue)

  const toggleExpanded = (value) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const handleAddClassification = async () => {
    const value = newClassification.trim()
    if (!value) return
    setAddingClassification(true)
    setRowError(null)
    try {
      await createPicklistValue({ field: 'CLASSIFICATION', value })
      setNewClassification('')
      load()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Failed to add classification.')
    } finally {
      setAddingClassification(false)
    }
  }

  const handleAddCategory = async (classificationValue) => {
    const value = (newCategoryInputs[classificationValue] || '').trim()
    if (!value) return
    setAddingCategoryFor(classificationValue)
    setRowError(null)
    try {
      await createPicklistValue({ field: 'CATEGORY', value, parentValue: classificationValue })
      setNewCategoryInputs((prev) => ({ ...prev, [classificationValue]: '' }))
      load()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Failed to add sub-classification.')
    } finally {
      setAddingCategoryFor(null)
    }
  }

  const startEdit = (kind, item) => {
    setEditing({ kind, id: item.Picklist_Value_Id, value: item.Value })
    setRowError(null)
  }

  const handleSaveEdit = async () => {
    const value = editing.value.trim()
    if (!value) return
    setRowError(null)
    try {
      await updatePicklistValue(editing.id, { value })
      setEditing(null)
      load()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Failed to rename.')
    }
  }

  const confirmDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deletePicklistValue(pendingDelete.item.Picklist_Value_Id)
      setPendingDelete(null)
      load()
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card">
      <div>
        <h2 className="text-[15px] font-bold text-ink-strong">Classification &amp; Category</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">
          Classification is the ticket type; each one holds its own list of Categories (sub-classifications) agents
          pick from underneath it.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={newClassification}
          onChange={(e) => setNewClassification(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddClassification()}
          placeholder="Add a new classification"
          className="flex-1"
        />
        <Button
          variant="primary"
          icon={Plus}
          onClick={handleAddClassification}
          disabled={addingClassification || !newClassification.trim()}
        >
          Add
        </Button>
      </div>

      {rowError && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{rowError}</p>}

      {state.error ? (
        <ErrorState message={state.error} onRetry={load} />
      ) : state.loading && state.classifications.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : state.classifications.length === 0 ? (
        <EmptyState title="No classifications yet" description="Add the first one above." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {state.classifications.map((item) => {
            const isExpanded = expanded.has(item.Value)
            const children = categoriesFor(item.Value)
            return (
              <li key={item.Picklist_Value_Id} className="rounded-lg border border-border bg-slate-50/60">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    onClick={() => toggleExpanded(item.Value)}
                    title={isExpanded ? 'Collapse' : 'Expand'}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-slate-200 hover:text-ink cursor-pointer"
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>

                  {editing?.kind === 'classification' && editing.id === item.Picklist_Value_Id ? (
                    <>
                      <Input
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                        className="flex-1"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveEdit}
                        title="Save"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-success-dark transition hover:bg-success/10 cursor-pointer"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        title="Cancel"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-slate-200 cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => toggleExpanded(item.Value)}
                        className="flex-1 truncate text-left text-[13px] font-semibold text-ink cursor-pointer"
                      >
                        {item.Value}
                      </button>
                      <span className="rounded-full bg-navy/5 px-2 py-0.5 font-mono text-[11px] font-bold text-navy">
                        {children.length}
                      </span>
                      <button
                        onClick={() => startEdit('classification', item)}
                        title="Edit"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-slate-200 hover:text-ink cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setPendingDelete({ kind: 'classification', item })}
                        title="Delete"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>

                {isExpanded && (
                  <div className="flex flex-col gap-1.5 border-t border-border/70 px-3 py-2 pl-11">
                    {children.length === 0 && (
                      <p className="py-1 text-[12px] italic text-muted">No sub-classifications yet.</p>
                    )}
                    {children.map((child) => (
                      <div key={child.Picklist_Value_Id} className="flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5">
                        {editing?.kind === 'category' && editing.id === child.Picklist_Value_Id ? (
                          <>
                            <Input
                              value={editing.value}
                              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                              onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                              className="flex-1"
                              autoFocus
                            />
                            <button
                              onClick={handleSaveEdit}
                              title="Save"
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-success-dark transition hover:bg-success/10 cursor-pointer"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              title="Cancel"
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-slate-200 cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 truncate text-[12.5px] text-ink">{child.Value}</span>
                            <button
                              onClick={() => startEdit('category', child)}
                              title="Edit"
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-slate-200 hover:text-ink cursor-pointer"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => setPendingDelete({ kind: 'category', item: child })}
                              title="Delete"
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    ))}

                    <div className="mt-1 flex gap-2">
                      <Input
                        value={newCategoryInputs[item.Value] || ''}
                        onChange={(e) => setNewCategoryInputs((prev) => ({ ...prev, [item.Value]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCategory(item.Value)}
                        placeholder="Add a sub-classification"
                        className="flex-1"
                      />
                      <Button
                        variant="secondary"
                        icon={Plus}
                        onClick={() => handleAddCategory(item.Value)}
                        disabled={addingCategoryFor === item.Value || !(newCategoryInputs[item.Value] || '').trim()}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete?.kind === 'classification' ? 'Delete classification' : 'Delete sub-classification'}
        message={
          pendingDelete?.kind === 'classification' ? (
            <>
              Delete <strong>{pendingDelete.item.Value}</strong>? Its {categoriesFor(pendingDelete.item.Value).length}{' '}
              sub-classification(s) will be deleted with it. Tickets already using any of these keep the value, but
              none will be offered going forward.
            </>
          ) : (
            <>
              Delete <strong>{pendingDelete?.item.Value}</strong>? Tickets already using it keep the value, but it
              won't be offered going forward.
            </>
          )
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
