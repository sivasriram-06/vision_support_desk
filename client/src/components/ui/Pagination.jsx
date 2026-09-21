import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Paging footer driven by the backend's {limit,page,total,hasMore} paging block. */
export default function Pagination({ paging, onPageChange }) {
  if (!paging) return null
  const { page, limit, total, hasMore } = paging
  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end = Math.min(page * limit, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF2F8] px-4 py-3">
      <p className="text-[12.5px] text-muted">
        Showing <span className="font-semibold text-ink">{start}-{end}</span> of{' '}
        <span className="font-semibold text-ink">{total}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[70px] text-center font-mono text-[12.5px] font-semibold text-ink">
          Page {page}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!hasMore}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
