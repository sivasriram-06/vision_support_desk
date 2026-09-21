import { NavLink } from 'react-router-dom'
import { Inbox, Users, Building2, UserCog, Network, UsersRound, Mail, Headset } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/tickets', label: 'All Cases', icon: Inbox, live: true },
  { to: '/contacts', label: 'Contacts', icon: Users, live: false },
  { to: '/accounts', label: 'Accounts', icon: Building2, live: false },
  { to: '/agents', label: 'Agents', icon: UserCog, live: false },
  { to: '/departments', label: 'Departments', icon: Network, live: false },
  { to: '/teams', label: 'Teams', icon: UsersRound, live: false },
  { to: '/gmail', label: 'Gmail Sync', icon: Mail, live: false },
]

/** Fixed navy left sidebar, ~240px, matches the reference `.sidebar` / `.sidebar-nav-item` treatment. */
export default function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-navy text-white shadow-[2px_0_12px_rgba(15,23,42,0.12)]">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-primary-light to-primary shadow-[0_4px_10px_-3px_rgba(232,99,43,0.65)]">
          <Headset className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-extrabold tracking-tight text-white">Vision Support</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Desk</p>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon, live }) =>
          live ? (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-[13px] font-semibold transition-all ${
                  isActive ? 'bg-primary/15 text-primary' : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                }`
              }
            >
              <Icon className="h-[17px] w-[17px] shrink-0" />
              {label}
            </NavLink>
          ) : (
            <div
              key={to}
              title="Coming soon"
              className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-[13px] font-semibold text-white/25"
            >
              <Icon className="h-[17px] w-[17px] shrink-0" />
              <span className="flex-1">{label}</span>
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/30">
                Soon
              </span>
            </div>
          ),
        )}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="text-[10.5px] font-semibold text-white/30">Sunoida Support</p>
      </div>
    </aside>
  )
}
