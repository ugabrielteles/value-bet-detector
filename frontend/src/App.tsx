import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { BrowserRouter } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { Navigation } from './components/layout/Navigation'
import { FullPageSpinner } from './components/ui/Spinner'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MatchDetail from './pages/MatchDetail'
import Alerts from './pages/Alerts'
import Analytics from './pages/Analytics'
import BankrollSettings from './pages/BankrollSettings'
import Simulator from './pages/Simulator'
import DataIngestion from './pages/DataIngestion'

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
        <Route path="/data-ingestion" element={<DataIngestion />} />
        <Route path="/simulator" element={<Simulator />} />
        <Route path="/bankroll" element={<BankrollSettings />} />
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
