import { AlertTriangle } from 'lucide-react'

export default function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10">
        <AlertTriangle className="h-6 w-6 text-danger" />
      </div>
      <div>
        <p className="text-[14px] font-semibold text-ink">Something went wrong</p>
        <p className="mt-1 max-w-sm text-[13px] text-muted">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 rounded-lg border border-border bg-white px-4 py-1.5 text-[13px] font-semibold text-ink hover:bg-slate-50 cursor-pointer"
        >
          Try again
        </button>
      )}
    </div>
  )
}
