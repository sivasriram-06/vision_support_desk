import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Check, X } from 'lucide-react'
import Avatar from '../components/ui/Avatar.jsx'
import Input from '../components/ui/Input.jsx'
import Select from '../components/ui/Select.jsx'
import Button from '../components/ui/Button.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
import { ApiError, getCustomer, updateCustomer, getBanks } from '../utils/api.js'

const customerName = (c) => c.Full_Name || c.Email || 'Unknown'

const COUNTS = [
  { key: 'Total_Tickets', label: 'All Tickets', tone: 'text-ink-strong' },
  { key: 'Open_Tickets', label: 'Open Tickets', tone: 'text-ink-strong' },
  { key: 'Closed_Tickets', label: 'Closed Tickets', tone: 'text-success-dark' },
  { key: 'Overdue_Tickets', label: 'Overdue Tickets', tone: 'text-danger' },
]

/**
 * One customer: properties on the left (name + bank editable, email
 * read-only - it's how Gmail matches their next mail), ticket counts on
 * the right.
 */
export default function CustomerDetailPage() {
  const { contactId } = useParams()
  const [state, setState] = useState({ loading: true, error: null, customer: null })
  const [banks, setBanks] = useState([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', bankId: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    getBanks().then((res) => setBanks(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))
    getCustomer(contactId)
      .then((res) => !cancelled && setState({ loading: false, error: null, customer: res.data }))
      .catch((err) => !cancelled && setState({ loading: false, error: err instanceof ApiError ? err.message : 'Failed to load customer.', customer: null }))
    return () => {
      cancelled = true
    }
  }, [contactId, reloadKey])

  const c = state.customer

  const startEdit = () => {
    setForm({ name: customerName(c), bankId: c.Bank_Id || '' })
    setSaveError(null)
    setEditing(true)
  }

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await updateCustomer(contactId, { name: form.name.trim(), bankId: form.bankId || null })
      setState({ loading: false, error: null, customer: res.data })
      setEditing(false)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save customer.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <Link to="/customers" className="flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-muted transition hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Customers
      </Link>

      {state.error ? (
        <ErrorState message={state.error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : !c ? (
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      ) : (
        <>
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={customerName(c)} size={44} />
            <div className="min-w-0">
              <h1 className="truncate text-[20px] font-bold text-ink-strong">{customerName(c)}</h1>
              <p className="truncate text-[13px] text-muted">{c.Email}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
            <section className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-bold text-ink-strong">Customer Properties</h2>
                {!editing && (
                  <button
                    onClick={startEdit}
                    title="Edit"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition hover:bg-slate-50 hover:text-ink cursor-pointer"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Field label="Name">
                {editing ? (
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
                ) : (
                  <span className="break-all">{customerName(c)}</span>
                )}
              </Field>
              <Field label="Email" hint={editing ? 'Not editable - Gmail uses it to match their next mail.' : null}>
                <span className="break-all">{c.Email || '—'}</span>
              </Field>
              <Field label="Bank">
                {editing ? (
                  <Select
                    value={form.bankId}
                    onChange={(e) => setForm({ ...form, bankId: e.target.value })}
                    options={banks.map((b) => ({ value: b.Bank_Id, label: b.Bank_Name }))}
                    placeholder="No bank"
                  />
                ) : (
                  c.Bank_Name || <span className="text-slate-400">No bank</span>
                )}
              </Field>

              {saveError && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{saveError}</p>}
              {editing && (
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" icon={X} onClick={() => setEditing(false)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button variant="primary" icon={Check} onClick={save} disabled={saving || !form.name.trim()}>
                    Save
                  </Button>
                </div>
              )}
            </section>

            <section className="grid grid-cols-2 content-start gap-4">
              {COUNTS.map((item) => (
                <div key={item.key} className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card">
                  <p className={`text-[13px] font-semibold ${item.key === 'Overdue_Tickets' ? 'text-danger' : 'text-muted'}`}>{item.label}</p>
                  <p className={`mt-2 text-[30px] font-bold leading-none ${item.tone}`}>{c[item.key]}</p>
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] font-semibold text-muted">{label}</span>
      <div className="text-[13.5px] font-medium text-ink">{children}</div>
      {hint && <span className="text-[11.5px] text-slate-400">{hint}</span>}
    </div>
  )
}
