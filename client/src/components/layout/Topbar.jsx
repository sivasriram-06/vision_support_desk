import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut } from 'lucide-react'
import Avatar from '../ui/Avatar.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'


export default function Topbar() {
  const { agent, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const fullName = [agent?.firstName, agent?.lastName].filter(Boolean).join(' ')
  const subtitle = [agent?.roleName, agent?.teamName].filter(Boolean).join(' · ')

  useEffect(() => {
    if (!menuOpen) return
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-white/95 px-5 backdrop-blur-md backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_20px_-14px_rgba(16,24,40,0.55)]">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-navy to-sky" />

      <div className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-primary/30 bg-white shadow-[0_2px_8px_-3px_rgba(232,99,43,0.5)]">
        <span className="h-2 w-2 rounded-full bg-primary" />
      </div>
      <p className="text-[13.5px] font-extrabold uppercase tracking-wide text-navy">Client Support</p>
      <span className="mx-1 h-4 w-px bg-gradient-to-b from-transparent via-border-strong to-transparent" />
      <p className="truncate text-[12px] font-semibold text-slate-500">Sunoida Solutions</p>

      <div className="relative ml-auto" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((prev) => !prev)}
          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1 transition hover:bg-slate-100"
        >
          <div className="hidden text-right sm:block">
            <p className="text-[12.5px] font-bold leading-tight text-ink">{fullName}</p>
            {subtitle && <p className="text-[11px] leading-tight text-muted">{subtitle}</p>}
          </div>
          <Avatar name={fullName} size={32} />
          <ChevronDown className="h-3.5 w-3.5 text-muted" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-1.5 w-60 overflow-hidden rounded-xl border border-border bg-white shadow-dropdown">
            <div className="border-b border-[#EEF2F8] px-4 py-3">
              <p className="truncate text-[13px] font-bold text-ink">{fullName}</p>
              <p className="truncate text-[12px] text-muted">{agent?.email}</p>
              {subtitle && <p className="mt-1 truncate text-[11.5px] font-semibold text-slate-500">{subtitle}</p>}
            </div>
            <button
              onClick={logout}
              className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-[13px] font-semibold text-danger transition hover:bg-danger/5"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
