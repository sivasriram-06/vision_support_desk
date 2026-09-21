import Avatar from '../ui/Avatar.jsx'

/**
 * Sticky frosted top bar with a 3px brand-gradient accent edge, matching the
 * reference's `.ws-bar` workspace identity strip.
 */
export default function Topbar() {
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-white/95 px-5 backdrop-blur-md backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_20px_-14px_rgba(16,24,40,0.55)]">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-navy to-sky" />

      <div className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-primary/30 bg-white shadow-[0_2px_8px_-3px_rgba(232,99,43,0.5)]">
        <span className="h-2 w-2 rounded-full bg-primary" />
      </div>
      <p className="text-[13.5px] font-extrabold uppercase tracking-wide text-navy">Client Support</p>
      <span className="mx-1 h-4 w-px bg-gradient-to-b from-transparent via-border-strong to-transparent" />
      <p className="truncate text-[12px] font-semibold text-slate-500">Sunoida Solutions · tasks@sunoida.com</p>

      <div className="ml-auto flex items-center gap-3">
        <Avatar name="Sunoida Agent" size={32} />
      </div>
    </header>
  )
}
