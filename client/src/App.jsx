import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/layout/AppShell.jsx'
import TicketsPage from './pages/TicketsPage.jsx'
import TicketDetailPage from './pages/TicketDetailPage.jsx'
import BanksPage from './pages/BanksPage.jsx'
import EscalationsPage from './pages/EscalationsPage.jsx'
import AgentsPage from './pages/AgentsPage.jsx'
import ConfigPage from './pages/ConfigPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ChangePasswordPage from './pages/ChangePasswordPage.jsx'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import { PERMISSIONS } from './auth/permissions.js'

/** Renders the page only when the agent holds `permission`; otherwise back to the case list. */
function Guard({ permission, children }) {
  const { can } = useAuth()
  return can(permission) ? children : <Navigate to="/tickets" replace />
}

function AuthenticatedApp() {
  const { status, agent } = useAuth()

  if (status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center bg-surface text-[13px] text-muted">Loading…</div>
  }
  if (status === 'signedOut') return <LoginPage />
  if (agent?.mustChangePassword) return <ChangePasswordPage />

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/tickets" replace />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/tickets/:ticketId" element={<TicketDetailPage />} />
        <Route path="/escalations" element={<EscalationsPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/banks" element={<BanksPage />} />
        <Route path="/teams" element={<Navigate to="/banks" replace />} />
        <Route path="/config" element={<Guard permission={PERMISSIONS.CONFIG_MANAGE}><ConfigPage /></Guard>} />
        <Route path="/admin" element={<Guard permission={PERMISSIONS.ADMIN_ACCESS}><AdminPage /></Guard>} />
        <Route path="/settings" element={<Navigate to="/config" replace />} />
        <Route path="*" element={<Navigate to="/tickets" replace />} />
      </Routes>
    </AppShell>
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
