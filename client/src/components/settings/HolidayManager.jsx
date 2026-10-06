import { useCallback, useEffect, useState } from 'react'
import { CalendarOff, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import Input from '../ui/Input.jsx'
import Button from '../ui/Button.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import ErrorState from '../ui/ErrorState.jsx'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import { formatDateTime } from '../../utils/format.js'
import {
  ApiError,
  getHolidays,
  getHolidayImpact,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  updateHolidaySettings,
} from '../../utils/api.js'

const errorText = (err, fallback) => (err instanceof ApiError ? err.message : fallback)
const shortDate = (iso) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString(undefined, { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' })

// SLA and resolution time skip holidays like a weekend (24x7 per setting); saving re-dates open tickets.
export default function HolidayManager({ className = '' }) {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [state, setState] = useState({ loading: true, error: null, holidays: [], years: [], settings: { applyTo24x7: false } })
  const [form, setForm] = useState({ date: '', name: '' })
  const [impact, setImpact] = useState(null)
  const [editing, setEditing] = useState(null) // { id, date, name }
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null) // { tone, text }
  const [pendingDelete, setPendingDelete] = useState(null)

  const load = useCallback(() => {
    getHolidays({ year })
      .then((res) => setState({ loading: false, error: null, ...res.data }))
      .catch((err) => setState((prev) => ({ ...prev, loading: false, error: errorText(err, 'Failed to load holidays.') })))
  }, [year])

  useEffect(() => {
    load()
  }, [load])

  // Impact preview for the date being added: which open tickets' SLA due date moves.
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return undefined
    let cancelled = false
    getHolidayImpact({ date: form.date })
      .then((res) => !cancelled && setImpact(res.data))
      .catch(() => !cancelled && setImpact(null))
    return () => {
      cancelled = true
    }
  }, [form.date])

  const run = async (action, success) => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await action()
      const moved = res.data?.ticketsMoved
      setMessage({ tone: 'ok', text: `${success}${moved ? ` - ${moved} open ticket${moved === 1 ? '' : 's'} re-dated` : ''}` })
      load()
      return true
    } catch (err) {
      setMessage({ tone: 'error', text: errorText(err, 'Something went wrong.') })
      return false
    } finally {
      setBusy(false)
    }
  }

  const add = async () => {
    if (await run(() => createHoliday({ holidayDate: form.date, holidayName: form.name.trim() }), `Added ${form.name.trim()}`)) {
      if (form.date.slice(0, 4) !== String(year)) setYear(Number(form.date.slice(0, 4)))
      setForm({ date: '', name: '' })
      setImpact(null)
    }
  }
  const saveEdit = async () => {
    if (await run(() => updateHoliday(editing.id, { holidayDate: editing.date, holidayName: editing.name.trim() }), 'Holiday updated')) setEditing(null)
  }
  const remove = async () => {
    const h = pendingDelete
    setPendingDelete(null)
    await run(() => deleteHoliday(h.Holiday_Id), `Removed ${h.Holiday_Name}`)
  }
  const toggle24x7 = (checked) => run(() => updateHolidaySettings({ applyTo24x7: checked }), checked ? 'Premium (24x7) banks now skip holidays' : 'Premium (24x7) banks now count holidays')

  const years = [...new Set([thisYear, thisYear + 1, ...state.years])].sort((a, b) => b - a)
  const canAdd = /^\d{4}-\d{2}-\d{2}$/.test(form.date) && form.name.trim().length >= 2 && !busy

  return (
    <div className={`flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink-strong">
            <CalendarOff className="h-4 w-4 text-primary" /> Holiday Calendar
          </h2>
          <p className="mt-0.5 max-w-3xl text-[12.5px] text-muted">
            Company holidays - days our support team is off. The SLA due date and resolution time skip them like a weekend. An agent who works on a
            holiday starts the holiday timer on the ticket; that time counts toward resolution time only.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-[12px] font-semibold ${y === year ? 'bg-navy text-white' : 'text-muted hover:bg-slate-100'}`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-slate-50/60 px-3.5 py-3">
        <input
          type="checkbox"
          checked={state.settings.applyTo24x7}
          disabled={busy}
          onChange={(e) => toggle24x7(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        <span>
          <span className="block text-[13px] font-semibold text-ink">Holidays also apply to Premium (24×7) banks</span>
          <span className="block text-[12px] text-muted">
            Off: 24×7 banks are supported every day, holidays included - their clock keeps running. On: they skip holidays like every other bank.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Date</span>
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-44" />
        </label>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Holiday</span>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && canAdd && add()}
            placeholder="e.g. Deepavali"
          />
        </label>
        <Button variant="primary" icon={Plus} onClick={add} disabled={!canAdd}>
          Add holiday
        </Button>
      </div>
      {impact && form.date === impact.date && (
        <p className="-mt-2 text-[12px] text-muted">
          {impact.affected.length === 0
            ? 'No open ticket’s SLA due date changes.'
            : `Moves the SLA due date of ${impact.affected.length} open ticket${impact.affected.length === 1 ? '' : 's'}: ${impact.affected
                .slice(0, 5)
                .map((t) => `#${t.ticketNumber} (${formatDateTime(t.from)} → ${formatDateTime(t.to)})`)
                .join(', ')}${impact.affected.length > 5 ? '…' : ''}`}
        </p>
      )}
      {message && (
        <p className={`rounded-lg px-3 py-2 text-[12.5px] font-medium ${message.tone === 'ok' ? 'bg-success/10 text-success-dark' : 'bg-danger/10 text-danger'}`}>
          {message.text}
        </p>
      )}

      {state.error ? (
        <ErrorState message={state.error} onRetry={load} />
      ) : state.loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : state.holidays.length === 0 ? (
        <EmptyState title={`No holidays in ${year}`} description="Add the first one above." />
      ) : (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {state.holidays.map((h) => {
            const past = h.Holiday_Date < new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
            const isEditing = editing?.id === h.Holiday_Id
            return (
              <li key={h.Holiday_Id} className={`flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 ${past ? 'bg-slate-50 opacity-70' : 'bg-white'}`}>
                <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-primary/10 py-1 text-primary-dark">
                  <span className="text-[10px] font-bold uppercase">{shortDate(h.Holiday_Date).split(' ')[1]}</span>
                  <span className="text-[16px] font-extrabold leading-none">{shortDate(h.Holiday_Date).split(' ')[0]}</span>
                </div>
                {isEditing ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
                    <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink" title={h.Holiday_Name}>{h.Holiday_Name}</p>
                    <p className="text-[11.5px] text-muted">{h.Weekday}{past ? ' · passed' : ''}</p>
                  </div>
                )}
                {isEditing ? (
                  <>
                    <button onClick={saveEdit} disabled={busy} title="Save" className="flex h-7 w-7 items-center justify-center rounded-md text-success-dark hover:bg-success/10 cursor-pointer">
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditing(null)} title="Cancel" className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-slate-100 cursor-pointer">
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setEditing({ id: h.Holiday_Id, date: h.Holiday_Date, name: h.Holiday_Name })}
                      title="Edit"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-slate-100 hover:text-ink cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setPendingDelete(h)} title="Delete" className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-danger/10 hover:text-danger cursor-pointer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Remove holiday"
        message={
          <>
            Remove <strong>{pendingDelete?.Holiday_Name}</strong> ({pendingDelete?.Holiday_Date})? That day becomes a normal working day: open tickets’ SLA due
            dates and resolution times are recalculated.
          </>
        }
        loading={busy}
        onConfirm={remove}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
