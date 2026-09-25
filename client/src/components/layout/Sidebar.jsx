import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { getMyTicketCounts } from '../../utils/api.js'
import { Inbox, UserCheck, Siren, UserCog, Landmark, Headset, Settings, ShieldCheck, Pin, PinOff } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { PERMISSIONS } from '../../auth/permissions.js'

// `permission` hides an item from agents who couldn't use the page anyway
// (the routes in App.jsx and the server enforce the same rule).
const NAV_ITEMS = [
  { to: '/my-tickets', label: 'My Tickets', icon: UserCheck, live: true, badge: 'unseen' },
  { to: '/tickets', label: 'All Cases', icon: Inbox, live: true },
  { to: '/escalations', label: 'Escalations', icon: Siren, live: true },
  { to: '/agents', label: 'Agents', icon: UserCog, live: true },
  { to: '/banks', label: 'Banks', icon: Landmark, live: true },
  { to: '/config', label: 'Config', icon: Settings, live: true, permission: PERMISSIONS.CONFIG_MANAGE },
  { to: '/admin', label: 'Admin', icon: ShieldCheck, live: true, permission: PERMISSIONS.ADMIN_ACCESS },
]


/**
 * Tickets newly assigned to me that I haven't opened yet - the sidebar
 * badge that tells an agent the lead handed them something. Polled every
 * minute, and refreshed at once when a ticket is opened.
 */
function useUnseenAssignments() {
  const [unseen, setUnseen] = useState(0)
  useEffect(() => {
    let cancelled = false
    const load = () =>
      getMyTicketCounts()
        .then((res) => !cancelled && setUnseen(res.data.unseen || 0))
        .catch(() => {})
    load()
    const timer = setInterval(load, 60000)
    window.addEventListener('vsd:my-tickets-changed', load)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('vsd:my-tickets-changed', load)
    }
  }, [])
  return unseen
}

export default function Sidebar({ pinned, onTogglePin }) {
  const [hovered, setHovered] = useState(false)
  const { can } = useAuth()
  const expanded = pinned || hovered
  const navItems = NAV_ITEMS.filter((item) => !item.permission || can(item.permission))
  const unseen = useUnseenAssignments()

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
        {navItems.map(({ to, label, icon: Icon, live, badge }) =>
          live ? (
            <NavLink
              key={to}
              to={to}
              title={expanded ? undefined : label}
              className={({ isActive }) =>
                `relative flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-[13px] font-semibold transition-all ${
                  expanded ? '' : 'justify-center px-0'
                } ${isActive ? 'bg-primary/15 text-primary' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`
              }
            >
              <Icon className="h-[17px] w-[17px] shrink-0" />
              {expanded && <span className="flex-1">{label}</span>}
              {badge === 'unseen' && unseen > 0 && (
                <span
                  title={`${unseen} newly assigned`}
                  className={`rounded-full bg-primary px-1.5 font-mono text-[10.5px] font-bold leading-[18px] text-white ${
                    expanded ? '' : 'absolute right-2 top-1'
                  }`}
                >
                  {unseen}
                </span>
              )}
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
