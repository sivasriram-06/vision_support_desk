import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import PageTitle from '../components/ui/PageTitle.jsx'
import Button from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
import SkeletonRows from '../components/ui/SkeletonRows.jsx'
import { ApiError, getRecycleBin, restoreTicket } from '../utils/api.js'
import { formatDateTime } from '../utils/format.js'
import useRealtime, { RT } from '../realtime/useRealtime.js'

const COLUMNS = [
  { label: 'Ticket', width: '7%' },
  { label: 'Subject', width: '23%' },
  { label: 'Customer', width: '14%' },
  { label: 'Bank / Team', width: '14%' },
  { label: 'Deleted', width: '15%' },
  { label: 'Permanently deleted on', width: '16%' },
  { label: '', width: '11%' },
]

/**
 * Recycle bin (tickets.delete: Admin, Manager, Team Lead): tickets a person
 * deleted. Each can be restored until its time runs out (RECYCLE_BIN_DAYS on
 * the server); then the purge job deletes it for good.
 */
export default function RecycleBinPage() {
  const [state, setState] = useState({ loading: true, error: null, tickets: [], retentionDays: null })
  const [reloadKey, setReloadKey] = useState(0)
  const [restoring, setRestoring] = useState(null)
  const [rowError, setRowError] = useState({})
  // Live: a ticket deleted, restored or purged anywhere.
  useRealtime([RT.TICKET_DELETED, RT.TICKET_CREATED], () => setReloadKey((k) => k + 1))

  const seenReloadKey = useRef(reloadKey)
  useEffect(() => {
    let cancelled = false
    const quiet = seenReloadKey.current !== reloadKey
    seenReloadKey.current = reloadKey
    if (!quiet) setState((prev) => ({ ...prev, loading: true, error: null }))
    getRecycleBin()
      .then((res) => !cancelled && setState({ loading: false, error: null, tickets: res.data.tickets, retentionDays: res.data.retentionDays }))
      .catch((err) => !cancelled && setState({ loading: false, error: err instanceof ApiError ? err.message : 'Failed to load the recycle bin.', tickets: [], retentionDays: null }))
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const restore = async (ticket) => {
    setRestoring(ticket.Ticket_Id)
    setRowError((prev) => ({ ...prev, [ticket.Ticket_Id]: null }))
    try {
      await restoreTicket(ticket.Ticket_Id)
      setState((prev) => ({ ...prev, tickets: prev.tickets.filter((t) => t.Ticket_Id !== ticket.Ticket_Id) }))
    } catch (err) {
      setRowError((prev) => ({ ...prev, [ticket.Ticket_Id]: err instanceof ApiError ? err.message : 'Failed to restore.' }))
    } finally {
      setRestoring(null)
    }
  }

  const days = state.retentionDays
  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title="Recycle Bin"
        count={state.loading ? undefined : state.tickets.length}
        subtitle={
          days
            ? `Deleted tickets can be restored for ${days} day${days === 1 ? '' : 's'}. After that they are permanently deleted with their mails, notes and attachments.`
            : 'Deleted tickets can be restored until they are permanently deleted.'
        }
      />

      {state.error ? (
        <ErrorState message={state.error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-card">
          <table className="w-full table-fixed border-collapse text-[12.5px]">
            <colgroup>
              {COLUMNS.map((col, i) => (
                <col key={i} style={{ width: col.width }} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-gradient-to-b from-[#F4F7FB] to-[#E9EEF6]">
                {COLUMNS.map((col, i) => (
                  <th
                    key={i}
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
                state.tickets.map((t) => (
                  <tr key={t.Ticket_Id} className="border-b border-slate-100 align-top last:border-b-0">
                    <td className="px-3.5 py-3 font-mono font-semibold text-muted">#{t.Ticket_Number}</td>
                    <td className="px-3.5 py-3">
                      <p className="truncate font-semibold text-ink-strong" title={t.Subject}>
                        {t.Subject}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-muted">
                        {t.Status}
                        {t.Priority ? ` · ${t.Priority}` : ''}
                      </p>
                    </td>
                    <td className="px-3.5 py-3">
                      <p className="truncate text-ink">{t.Contact_Name || t.Contact_Email || '—'}</p>
                      {t.Contact_Name && <p className="truncate text-[11.5px] text-muted">{t.Contact_Email}</p>}
                    </td>
                    <td className="px-3.5 py-3">
                      <p className="truncate text-ink">{t.Bank_Name || '—'}</p>
                      <p className="truncate text-[11.5px] text-muted">{t.Department_Name || ''}</p>
                    </td>
                    <td className="px-3.5 py-3">
                      <p className="text-ink">{formatDateTime(t.Deleted_Time)}</p>
                      <p className="truncate text-[11.5px] text-muted">by {t.Deleted_By_Name || 'Unknown'}</p>
                    </td>
                    <td className="px-3.5 py-3">
                      <p className="text-ink">{formatDateTime(t.Purge_Time)}</p>
                      <p className={`text-[11.5px] font-semibold ${t.Days_Left <= 3 ? 'text-danger' : 'text-muted'}`}>
                        {t.Days_Left > 0 ? `${t.Days_Left} day${t.Days_Left === 1 ? '' : 's'} left` : 'Being deleted'}
                      </p>
                    </td>
                    <td className="px-3.5 py-3">
                      <Button variant="secondary" icon={RotateCcw} onClick={() => restore(t)} disabled={restoring !== null || t.Days_Left <= 0}>
                        {restoring === t.Ticket_Id ? 'Restoring…' : 'Restore'}
                      </Button>
                      {rowError[t.Ticket_Id] && <p className="mt-1.5 text-[11.5px] font-medium text-danger">{rowError[t.Ticket_Id]}</p>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!state.loading && state.tickets.length === 0 && (
            <EmptyState title="The recycle bin is empty" description="Tickets you delete appear here and can be restored." />
          )}
        </div>
      )}
    </div>
  )
}
