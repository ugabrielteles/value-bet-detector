import { NavLink, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useAuthStore } from '../../store/authStore'
import { useValueBetsStore } from '../../store/valueBetsStore'

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/simulator', label: 'Simulator' },
  { to: '/bankroll', label: 'Bankroll' },
]

export function Navigation() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const newAlertsCount = useValueBetsStore((s) => s.newAlertsCount)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <nav className="sticky top-0 z-40 bg-gray-900 border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <NavLink to="/dashboard" className="flex items-center gap-2 text-white font-bold text-lg">
            <span>⚽</span>
            <span>ValueBet</span>
          </NavLink>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    'relative px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700',
                  )
                }
              >
                {item.label}
                {item.to === '/alerts' && newAlertsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {newAlertsCount > 99 ? '99+' : newAlertsCount}
                  </span>
                )}
              </NavLink>
            ))}
          </div>

          {/* User */}
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-sm text-gray-400">
                <span className="text-gray-200 font-medium">{user.username}</span>
              </span>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
