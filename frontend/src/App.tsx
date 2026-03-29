import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { BrowserRouter } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import Navigation from './components/layout/Navigation'
import { FullPageSpinner } from './components/ui/Spinner'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MatchDetail from './pages/MatchDetail'
import Alerts from './pages/Alerts'
import Analytics from './pages/Analytics'
import BankrollSettings from './pages/BankrollSettings'
import Simulator from './pages/Simulator'
import DataIngestion from './pages/DataIngestion'
import LiveOpportunities from './pages/LiveOpportunities'
import AdminPredictions from './pages/AdminPredictions'
import AutomationSettings from './pages/AutomationSettings'
import AutoBets from './pages/AutoBets'

function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) return <FullPageSpinner />
  if (!isAuthenticated) return <Navigate to="/login" replace />

  return (
    <>
      <Navigation />
      <Outlet />
    </>
  )
}

function AdminRoute() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = Boolean(
    user && ((user.role === 'admin') || (Array.isArray(user.roles) && user.roles.includes('admin'))),
  )

  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

function AppRoutes() {
  const initAuth = useAuthStore((s) => s.initAuth)
  const isLoading = useAuthStore((s) => s.isLoading)

  useEffect(() => {
    initAuth()
  }, [initAuth])

  if (isLoading) return <FullPageSpinner />

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/matches/:id" element={<MatchDetail />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/live-opportunities" element={<LiveOpportunities />} />
        <Route path="/data-ingestion" element={<DataIngestion />} />
        <Route path="/simulator" element={<Simulator />} />
        <Route path="/bankroll" element={<BankrollSettings />} />
        <Route path="/automation" element={<AutomationSettings />} />
        <Route path="/auto-bets" element={<AutoBets />} />
        <Route element={<AdminRoute />}>
          <Route path="/admin/predictions" element={<AdminPredictions />} />
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
