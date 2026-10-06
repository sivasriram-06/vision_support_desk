import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Landmark } from 'lucide-react'
import PageTitle from '../components/ui/PageTitle.jsx'
import Input from '../components/ui/Input.jsx'
import Select from '../components/ui/Select.jsx'
import Avatar from '../components/ui/Avatar.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
import Pagination from '../components/ui/Pagination.jsx'
import { ApiError, getCustomers, getBanks } from '../utils/api.js'
import useRealtime, { RT } from '../realtime/useRealtime.js'

const PAGE_SIZE = 48
const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']

const customerName = (c) => c.Full_Name || c.Email || 'Unknown'

// Everyone who has mailed the support inbox (added by the Gmail sync), with search, bank filter and A-Z bar.
export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [letter, setLetter] = useState('')
  const [bankId, setBankId] = useState('')
  const [page, setPage] = useState(1)
  const [banks, setBanks] = useState([])
  const [state, setState] = useState({ loading: true, error: null, rows: [], paging: null })
  const [reloadKey, setReloadKey] = useState(0)
  // Live: new senders (new tickets), ticket counts and customer edits.
  useRealtime([RT.TICKET_CREATED, RT.TICKET_CHANGED, RT.TICKET_DELETED, RT.TICKET_REOPEN, RT.CUSTOMER_CHANGED], () => setReloadKey((k) => k + 1))

  useEffect(() => {
    getBanks().then((res) => setBanks(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))
    const params = { page, limit: PAGE_SIZE }
    if (debounced) params.search = debounced
    if (letter) params.letter = letter
    if (bankId) params.bankId = bankId
    getCustomers(params)
      .then((res) => !cancelled && setState({ loading: false, error: null, rows: res.data, paging: res.paging }))
      .catch((err) => !cancelled && setState({ loading: false, error: err instanceof ApiError ? err.message : 'Failed to load customers.', rows: [], paging: null }))
    return () => {
      cancelled = true
    }
  }, [debounced, letter, bankId, page, reloadKey])

  const resetPage = (setter) => (value) => {
    setter(value)
    setPage(1)
  }

  const bankOptions = [{ value: 'none', label: 'No bank' }, ...banks.map((b) => ({ value: b.Bank_Id, label: b.Bank_Name }))]

  return (
    <div className="flex w-full flex-col gap-4">
      <PageTitle
        title="Customers"
        subtitle={`Everyone who has mailed the support inbox${state.paging ? ` · ${state.paging.total} total` : ''}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          icon={Search}
          value={search}
          onChange={(e) => resetPage(setSearch)(e.target.value)}
          placeholder="Search name or email"
          className="w-72"
        />
        <Select
          value={bankId}
          onChange={(e) => resetPage(setBankId)(e.target.value)}
          options={bankOptions}
          placeholder="All banks"
          className="w-56"
        />
      </div>

      <div className="flex gap-3">
        <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-200/90 bg-white shadow-card">
          {state.error ? (
            <div className="p-5">
              <ErrorState message={state.error} onRetry={() => setReloadKey((k) => k + 1)} />
            </div>
          ) : state.loading && state.rows.length === 0 ? (
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-[92px] animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : state.rows.length === 0 ? (
            <div className="p-8">
              <EmptyState title="No customers found" description="Customers appear here automatically when they mail the support inbox." />
            </div>
          ) : (
            <div className={`grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 ${state.loading ? 'opacity-60' : ''}`}>
              {state.rows.map((c) => (
                <CustomerCard key={c.Contact_Id} customer={c} />
              ))}
            </div>
          )}
          <Pagination paging={state.paging} onPageChange={setPage} />
        </div>

        <nav className="flex shrink-0 flex-col items-center gap-px rounded-2xl border border-slate-200/90 bg-white px-1 py-2 shadow-card" aria-label="Filter by first letter">
          <LetterButton active={!letter} onClick={() => resetPage(setLetter)('')}>All</LetterButton>
          {LETTERS.map((l) => (
            <LetterButton key={l} active={letter === l} onClick={() => resetPage(setLetter)(l)}>
              {l}
            </LetterButton>
          ))}
        </nav>
      </div>
    </div>
  )
}

function LetterButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`w-7 rounded-md py-0.5 text-center text-[11px] font-semibold transition cursor-pointer ${
        active ? 'bg-primary text-white' : 'text-muted hover:bg-slate-100 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function CustomerCard({ customer: c }) {
  const name = customerName(c)
  return (
    <Link
      to={`/customers/${c.Contact_Id}`}
      className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-slate-50/40 p-3 transition hover:border-primary/40 hover:bg-white hover:shadow-card"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={name} size={36} />
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-bold text-ink-strong" title={name}>{name}</p>
          <p className="truncate text-[12px] text-muted" title={c.Email}>{c.Email}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11.5px]">
        <span className={`flex min-w-0 items-center gap-1 truncate ${c.Bank_Name ? 'text-ink' : 'text-slate-400'}`}>
          <Landmark className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{c.Bank_Name || 'No bank'}</span>
        </span>
        <span className="shrink-0 text-muted">
          <strong className="text-ink">{c.Total_Tickets}</strong> tickets · <strong className="text-ink">{c.Open_Tickets}</strong> open
        </span>
      </div>
    </Link>
  )
}
