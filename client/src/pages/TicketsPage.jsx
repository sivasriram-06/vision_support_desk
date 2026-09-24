import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { List, UsersRound, Landmark } from 'lucide-react'
import PageTitle from '../components/ui/PageTitle.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
import TicketFilters from '../components/tickets/TicketFilters.jsx'
import TicketTable from '../components/tickets/TicketTable.jsx'
import QueueBoard from '../components/tickets/QueueBoard.jsx'
import { getTickets, ApiError } from '../utils/api.js'

const DEFAULT_FILTERS = { search: '', status: '', priority: '', slaBreached: false, sortBy: 'Created_Time', sortOrder: 'desc' }

// All Cases has three views: the flat list, a support team's queue and a
// bank's queue. View + selected queue live in the URL (?view=team&id=...)
// so a refresh or a shared link opens the same queue.
const VIEWS = [
  { value: 'list', label: 'All Cases', icon: List },
  { value: 'team', label: 'Team Queue', icon: UsersRound },
  { value: 'bank', label: 'Bank Queue', icon: Landmark },
]

export default function TicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const view = VIEWS.some((v) => v.value === searchParams.get('view')) ? searchParams.get('view') : 'list'
  const queueId = searchParams.get('id') || ''
  const setView = (next) => setSearchParams(next === 'list' ? {} : { view: next })
  const setQueueId = useCallback((id) => setSearchParams(id ? { view, id } : { view }, { replace: true }), [setSearchParams, view])

  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [tickets, setTickets] = useState([])
  const [paging, setPaging] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Reset to page 1 whenever a filter changes (not on plain pagination).
  useEffect(() => {
    setPage(1)
  }, [filters.search, filters.status, filters.priority, filters.slaBreached, filters.sortBy, filters.sortOrder])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(
      async () => {
        setLoading(true)
        setError(null)
        try {
          const res = await getTickets({
            page,
            limit: 100,
            search: filters.search || undefined,
            status: filters.status || undefined,
            slaBreached: filters.slaBreached ? 'true' : undefined,
            priority: filters.priority || undefined,
            sortBy: filters.sortBy,
            sortOrder: filters.sortOrder,
          })
          if (!cancelled) {
            setTickets(res.data)
            setPaging(res.paging)
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof ApiError ? err.message : 'Failed to load tickets.')
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      },
      filters.search ? 300 : 0,
    ) // debounce only the free-text search

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [page, filters])

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title={VIEWS.find((v) => v.value === view).label}
        subtitle={
          view === 'team'
            ? 'Every ticket routed to one support team, by priority or status'
            : view === 'bank'
              ? 'Every ticket for one bank, by priority or status'
              : 'Every support ticket across every channel'
        }
        count={view === 'list' ? paging?.total : undefined}
        actions={
          <div className="flex gap-1 rounded-xl border border-slate-200/90 bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            {VIEWS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setView(value)}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${
                  view === value ? 'bg-navy text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-ink'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        }
      />

      {view !== 'list' ? (
        <QueueBoard key={view} view={view} selectedId={queueId} onSelect={setQueueId} />
      ) : (
        <>
      <TicketFilters filters={filters} onChange={setFilters} />

      {error ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-card">
          <ErrorState message={error} onRetry={() => setFilters({ ...filters })} />
        </div>
      ) : (
        <TicketTable tickets={tickets} loading={loading} error={error} paging={paging} onPageChange={setPage} />
      )}
        </>
      )}
    </div>
  )
}
