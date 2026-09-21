import { useEffect, useState } from 'react'
import PageTitle from '../components/ui/PageTitle.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
import TicketFilters from '../components/tickets/TicketFilters.jsx'
import TicketTable from '../components/tickets/TicketTable.jsx'
import { getTickets, ApiError } from '../utils/api.js'

const DEFAULT_FILTERS = { search: '', statusType: '', priority: '', sortBy: 'Created_Time', sortOrder: 'desc' }

export default function TicketsPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [tickets, setTickets] = useState([])
  const [paging, setPaging] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Reset to page 1 whenever a filter changes (not on plain pagination).
  useEffect(() => {
    setPage(1)
  }, [filters.search, filters.statusType, filters.priority, filters.sortBy, filters.sortOrder])

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
            statusType: filters.statusType || undefined,
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
    <div className="flex flex-col gap-5">
      <PageTitle title="All Cases" subtitle="Every support ticket across every channel" count={paging?.total} />

      <TicketFilters filters={filters} onChange={setFilters} />

      {error ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-card">
          <ErrorState message={error} onRetry={() => setFilters({ ...filters })} />
        </div>
      ) : (
        <TicketTable tickets={tickets} loading={loading} error={error} paging={paging} onPageChange={setPage} />
      )}
    </div>
  )
}
