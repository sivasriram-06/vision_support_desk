import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/layout/AppShell.jsx'
import TicketsPage from './pages/TicketsPage.jsx'
import TicketDetailPage from './pages/TicketDetailPage.jsx'
import TeamsPage from './pages/TeamsPage.jsx'
import AgentsPage from './pages/AgentsPage.jsx'
import ConfigPage from './pages/ConfigPage.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/tickets" replace />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/tickets/:ticketId" element={<TicketDetailPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/settings" element={<Navigate to="/config" replace />} />
          <Route path="*" element={<Navigate to="/tickets" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
