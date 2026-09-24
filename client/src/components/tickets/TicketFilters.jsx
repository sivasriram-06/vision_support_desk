import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import Input from '../ui/Input.jsx'
import Select from '../ui/Select.jsx'
import { getPicklistValues, getPrioritySlaConfig } from '../../utils/api.js'

const SORT_OPTIONS = [
  { value: 'Created_Time:desc', label: 'Newest first' },
  { value: 'Created_Time:asc', label: 'Oldest first' },
  { value: 'Response_Due_Date:asc', label: 'SLA due soonest' },
  { value: 'Priority:asc', label: 'Priority' },
  { value: 'Subject:asc', label: 'Subject A-Z' },
]

/** Search + status + priority + sort toolbar for the All Cases list. Naked row, no card wrapper - matches the reference's filter-bar convention. */
export default function TicketFilters({ filters, onChange }) {
  const set = (patch) => onChange({ ...filters, ...patch })
  // Status and Priority options are the admin-managed lists from the Config
  // page, so the filter always matches what agents can set on a ticket.
  const [options, setOptions] = useState({ statuses: [], priorities: [] })

  useEffect(() => {
    let cancelled = false
    Promise.all([getPicklistValues('STATUS'), getPrioritySlaConfig()])
      .then(([statusRes, priorityRes]) => {
        if (cancelled) return
        setOptions({
          statuses: statusRes.data.map((s) => ({ value: s.Value, label: s.Value })),
          priorities: priorityRes.data.map((p) => ({ value: p.Priority, label: p.Priority })),
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

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
        options={options.statuses}
        value={filters.status}
        onChange={(e) => set({ status: e.target.value })}
        className="w-full sm:w-52"
      />
      <Select
        placeholder="All priorities"
        options={options.priorities}
        value={filters.priority}
        onChange={(e) => set({ priority: e.target.value })}
        className="w-full sm:w-40"
      />
      <label className="flex cursor-pointer items-center gap-2 rounded-[9px] border border-border bg-white px-3 py-2 text-[13px] font-medium text-ink">
        <input
          type="checkbox"
          checked={filters.slaBreached}
          onChange={(e) => set({ slaBreached: e.target.checked })}
          className="h-4 w-4 accent-danger"
        />
        <span title="Open tickets past their SLA due date, and tickets resolved or closed after it">SLA breached only</span>
      </label>
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
