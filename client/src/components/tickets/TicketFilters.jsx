import { Search } from 'lucide-react'
import Input from '../ui/Input.jsx'
import Select from '../ui/Select.jsx'

const STATUS_OPTIONS = [
  { value: 'Open', label: 'Open' },
  { value: 'On Hold', label: 'On Hold' },
  { value: 'Closed', label: 'Closed' },
]

const PRIORITY_OPTIONS = [
  { value: 'P1', label: 'P1 · Urgent' },
  { value: 'P2', label: 'P2 · High' },
  { value: 'P3', label: 'P3 · Normal' },
  { value: 'P4', label: 'P4 · Low' },
]

const SORT_OPTIONS = [
  { value: 'Created_Time:desc', label: 'Newest first' },
  { value: 'Created_Time:asc', label: 'Oldest first' },
  { value: 'Priority:asc', label: 'Priority' },
  { value: 'Subject:asc', label: 'Subject A-Z' },
]

/** Search + status + priority + sort toolbar for the All Cases list. Naked row, no card wrapper - matches the reference's filter-bar convention. */
export default function TicketFilters({ filters, onChange }) {
  const set = (patch) => onChange({ ...filters, ...patch })

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Input
        icon={Search}
        placeholder="Search subject or ticket number..."
        value={filters.search}
        onChange={(e) => set({ search: e.target.value })}
        className="w-full sm:w-64 xl:w-80"
      />
      <Select
        placeholder="All statuses"
        options={STATUS_OPTIONS}
        value={filters.statusType}
        onChange={(e) => set({ statusType: e.target.value })}
        className="w-full sm:w-40"
      />
      <Select
        placeholder="All priorities"
        options={PRIORITY_OPTIONS}
        value={filters.priority}
        onChange={(e) => set({ priority: e.target.value })}
        className="w-full sm:w-40"
      />
      <Select
        options={SORT_OPTIONS}
        value={`${filters.sortBy}:${filters.sortOrder}`}
        onChange={(e) => {
          const [sortBy, sortOrder] = e.target.value.split(':')
          set({ sortBy, sortOrder })
        }}
        className="w-full sm:w-44"
      />
    </div>
  )
}
