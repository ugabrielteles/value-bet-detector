import { NavLink, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useAuthStore } from '../../store/authStore'
import { useValueBetsStore } from '../../store/valueBetsStore'
import { useI18n } from '../../hooks/useI18n'
import { localeLabels } from '../../i18n/translations'

const navItems = [
  { to: '/dashboard', key: 'dashboard', adminOnly: false },
  // { to: '/alerts', key: 'alerts', adminOnly: false },
  // { to: '/analytics', key: 'analytics', adminOnly: false },
  { to: '/live-opportunities', key: 'live', adminOnly: false },
  { to: '/data-ingestion', key: 'ingestion', adminOnly: false },
  { to: '/simulator', key: 'simulator', adminOnly: false },
  { to: '/bankroll', key: 'bankroll', adminOnly: false },
  // { to: '/automation', key: 'automation', adminOnly: false },
  { to: '/auto-bets', key: 'autoBets', adminOnly: false },
  { to: '/admin/predictions', key: 'adminPredictions', adminOnly: true },
] as const

export default function Navigation() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const newAlertsCount = useValueBetsStore((s) => s.newAlertsCount)
  const { locale, setLocale, dict } = useI18n()
  const isAdmin = Boolean(
    user && ((user.role === 'admin') || (Array.isArray(user.roles) && user.roles.includes('admin'))),
  )

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
            {navItems.filter((item) => !item.adminOnly || isAdmin).map((item) => (
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
                {dict.nav[item.key]}
                {/* {item.to === '/alerts' && newAlertsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {newAlertsCount > 99 ? '99+' : newAlertsCount}
                  </span>
                )} */}
              </NavLink>
            ))}
          </div>

          {/* User */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <label htmlFor="locale-selector" className="text-xs uppercase tracking-wide text-gray-500">
                {dict.header.language}
              </label>
              <select
                id="locale-selector"
                value={locale}
                onChange={(e) => setLocale(e.target.value as keyof typeof localeLabels)}
                className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(localeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {user && (
              <span className="text-sm text-gray-400">
                <span className="text-gray-200 font-medium">{user.username}</span>
              </span>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors"
            >
              {dict.header.signOut}
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
