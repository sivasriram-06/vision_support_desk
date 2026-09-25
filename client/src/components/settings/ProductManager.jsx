import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import Input from '../ui/Input.jsx'
import Button from '../ui/Button.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import ErrorState from '../ui/ErrorState.jsx'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import { ApiError, getProducts, createProduct, updateProduct, deleteProduct } from '../../utils/api.js'

/** CRUD list for the Product catalog (Ticket.Product_Id -> HD_PRODUCT_MASTER). */
export default function ProductManager({ className = '' }) {
  const [state, setState] = useState({ loading: true, error: null, products: [] })
  const [newValue, setNewValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [rowError, setRowError] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const load = () => {
    setState((prev) => ({ loading: true, error: null, products: prev.products }))
    getProducts()
      .then((res) => setState({ loading: false, error: null, products: res.data }))
      .catch((err) => setState({ loading: false, error: err instanceof ApiError ? err.message : 'Failed to load products.', products: [] }))
  }

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async () => {
    const productName = newValue.trim()
    if (!productName) return
    setAdding(true)
    setRowError(null)
    try {
      await createProduct({ productName })
      setNewValue('')
      load()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Failed to add product.')
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (item) => {
    setEditingId(item.Product_Id)
    setEditValue(item.Product_Name)
    setRowError(null)
  }

  const handleSaveEdit = async (id) => {
    const productName = editValue.trim()
    if (!productName) return
    setRowError(null)
    try {
      await updateProduct(id, { productName })
      setEditingId(null)
      load()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Failed to update product.')
    }
  }

  const confirmDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteProduct(pendingDelete.Product_Id)
      setPendingDelete(null)
      load()
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete product.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={`flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card ${className}`}>
      <div>
        <h2 className="text-[15px] font-bold text-ink-strong">Products</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">Products agents can link to a ticket.</p>
      </div>

      <div className="flex gap-2">
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Add a new product"
          className="flex-1"
        />
        <Button variant="primary" icon={Plus} onClick={handleAdd} disabled={adding || !newValue.trim()}>
          Add
        </Button>
      </div>

      {rowError && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{rowError}</p>}

      {state.error ? (
        <ErrorState message={state.error} onRetry={load} />
      ) : state.loading && state.products.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : state.products.length === 0 ? (
        <EmptyState title="No products yet" description="Add the first one above." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {state.products.map((item) => (
            <li
              key={item.Product_Id}
              className="flex items-center gap-2 rounded-lg border border-border bg-slate-50/60 px-3 py-2"
            >
              {editingId === item.Product_Id ? (
                <>
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(item.Product_Id)}
                    className="flex-1"
                    autoFocus
                  />
                  <button
                    onClick={() => handleSaveEdit(item.Product_Id)}
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
                  <span className="flex-1 truncate text-[13px] font-medium text-ink">{item.Product_Name}</span>
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
        title="Delete product"
        message={<>Delete <strong>{pendingDelete?.Product_Name}</strong>? Tickets already using it keep the name, but it won't be offered going forward.</>}
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
