import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Inbox, Users, Building2, UserCog, Network, UsersRound, Mail, Headset, Settings, Pin, PinOff } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/tickets', label: 'All Cases', icon: Inbox, live: true },
  // { to: '/contacts', label: 'Contacts', icon: Users, live: false },
  // { to: '/accounts', label: 'Accounts', icon: Building2, live: false },
  { to: '/agents', label: 'Agents', icon: UserCog, live: true },
  // { to: '/departments', label: 'Departments', icon: Network, live: false },
  { to: '/teams', label: 'Teams', icon: UsersRound, live: true },
  // { to: '/gmail', label: 'Gmail Sync', icon: Mail, live: false },
  { to: '/config', label: 'Config', icon: Settings, live: true },
]


export default function Sidebar({ pinned, onTogglePin }) {
  const [hovered, setHovered] = useState(false)
  const expanded = pinned || hovered

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden bg-navy text-white shadow-[2px_0_12px_rgba(15,23,42,0.12)] transition-[width] duration-200 ${
        expanded ? 'w-60' : 'w-[72px]'
      }`}
    >
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-primary-light to-primary shadow-[0_4px_10px_-3px_rgba(232,99,43,0.65)]">
          <Headset className="h-5 w-5 text-white" />
        </div>
        {expanded && (
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-extrabold tracking-tight text-white">Vision Support</p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Desk</p>
            </div>
            <button
              onClick={onTogglePin}
              title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/50 transition hover:bg-white/10 hover:text-white cursor-pointer"
            >
              {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>

      <nav className="mt-2 flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon, live }) =>
          live ? (
            <NavLink
              key={to}
              to={to}
              title={expanded ? undefined : label}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-[13px] font-semibold transition-all ${
                  expanded ? '' : 'justify-center px-0'
                } ${isActive ? 'bg-primary/15 text-primary' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`
              }
            >
              <Icon className="h-[17px] w-[17px] shrink-0" />
              {expanded && label}
            </NavLink>
          ) : (
            <div
              key={to}
              title={expanded ? 'Coming soon' : label}
              className={`flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-[13px] font-semibold text-white/25 ${
                expanded ? '' : 'justify-center px-0'
              }`}
            >
              <Icon className="h-[17px] w-[17px] shrink-0" />
              {expanded && (
                <>
                  <span className="flex-1">{label}</span>
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/30">
                    Soon
                  </span>
                </>
              )}
            </div>
          ),
        )}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        {expanded && <p className="truncate text-[10.5px] font-semibold text-white/30">Sunoida Support</p>}
      </div>
    </aside>
  )
}
