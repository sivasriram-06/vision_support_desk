import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/layout/AppShell.jsx'
import TicketsPage from './pages/TicketsPage.jsx'
import TicketDetailPage from './pages/TicketDetailPage.jsx'
import BanksPage from './pages/BanksPage.jsx'
import EscalationsPage from './pages/EscalationsPage.jsx'
import MyTicketsPage from './pages/MyTicketsPage.jsx'
import AgentsPage from './pages/AgentsPage.jsx'
import CustomersPage from './pages/CustomersPage.jsx'
import CustomerDetailPage from './pages/CustomerDetailPage.jsx'
import ConfigPage from './pages/ConfigPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ChangePasswordPage from './pages/ChangePasswordPage.jsx'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import RealtimeProvider from './realtime/RealtimeProvider.jsx'
import { PERMISSIONS } from './auth/permissions.js'

/** Renders the page only when the agent holds `permission` (or any of a list); otherwise back to the case list. */
function Guard({ permission, children }) {
  const { can } = useAuth()
  const allowed = Array.isArray(permission) ? permission.some(can) : can(permission)
  return allowed ? children : <Navigate to="/tickets" replace />
}

function AuthenticatedApp() {
  const { status, agent } = useAuth()

  if (status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center bg-surface text-[13px] text-muted">Loading…</div>
  }
  if (status === 'signedOut') return <LoginPage />
  if (agent?.mustChangePassword) return <ChangePasswordPage />

  return (
    // Live updates over WebSocket while signed in (replaces polling).
    <RealtimeProvider>
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/tickets" replace />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/tickets/:ticketId" element={<TicketDetailPage />} />
        <Route path="/my-tickets" element={<MyTicketsPage />} />
        <Route path="/escalations" element={<EscalationsPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/banks" element={<BanksPage />} />
        <Route path="/customers" element={<Guard permission={PERMISSIONS.CUSTOMERS_MANAGE}><CustomersPage /></Guard>} />
        <Route path="/customers/:contactId" element={<Guard permission={PERMISSIONS.CUSTOMERS_MANAGE}><CustomerDetailPage /></Guard>} />
        <Route path="/teams" element={<Navigate to="/banks" replace />} />
        <Route path="/config" element={<Guard permission={[PERMISSIONS.CONFIG_MANAGE, PERMISSIONS.HOLIDAYS_MANAGE]}><ConfigPage /></Guard>} />
        <Route path="/admin" element={<Guard permission={PERMISSIONS.ADMIN_ACCESS}><AdminPage /></Guard>} />
        <Route path="/settings" element={<Navigate to="/config" replace />} />
        <Route path="*" element={<Navigate to="/tickets" replace />} />
      </Routes>
    </AppShell>
    </RealtimeProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </BrowserRouter>
  )
}
