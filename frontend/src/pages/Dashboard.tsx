import { useState } from 'react'
import { useValueBetsStore } from '../store/valueBetsStore'
import { useValueBets } from '../hooks/useValueBets'
import { useWebSocket } from '../hooks/useWebSocket'
import { ValueBetCard } from '../components/dashboard/ValueBetCard'
import { FiltersBar } from '../components/dashboard/FiltersBar'
import { Spinner } from '../components/ui/Spinner'
import { Button } from '../components/ui/Button'
import type { ValueBetFilters } from '../types'
import { useI18n } from '../hooks/useI18n'

export default function Dashboard() {
  const [filters, setFilters] = useState<ValueBetFilters>({ status: 'all', category: 'all', page: 1, limit: 20 })
  const { isConnected } = useWebSocket()

  const newAlertsCount = useValueBetsStore((s) => s.newAlertsCount)
  const clearNewAlerts = useValueBetsStore((s) => s.clearNewAlerts)
  const { dict } = useI18n()

  const { filteredBets, isLoading, error, total, currentPage, totalPages, refetch } = useValueBets(filters)

  const handleApplyFilters = (newFilters: ValueBetFilters) => {
    setFilters({ ...newFilters, page: 1 })
  }

  const handleResetFilters = () => {
    const reset: ValueBetFilters = { status: 'all', category: 'all', page: 1, limit: 20 }
    setFilters(reset)
  }

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }))
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{dict.dashboard.title}</h1>
          <p className="text-gray-400 text-sm mt-1">{total} {dict.dashboard.betsFound}</p>
        </div>
        <div className="flex items-center gap-3">
          {newAlertsCount > 0 && (
            <button
              onClick={clearNewAlerts}
              className="flex items-center gap-2 bg-red-900/40 border border-red-700 text-red-300 px-3 py-1.5 rounded-lg text-sm hover:bg-red-900/60 transition-colors"
            >
              <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
              {newAlertsCount} {newAlertsCount !== 1 ? dict.dashboard.newAlerts : dict.dashboard.newAlert}
            </button>
          )}
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}
            />
            <span className={isConnected ? 'text-green-400' : 'text-gray-500'}>
              {isConnected ? dict.dashboard.live : dict.dashboard.disconnected}
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <FiltersBar filters={filters} onApply={handleApplyFilters} onReset={handleResetFilters} />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <div className="text-red-400 mb-2">⚠ {dict.dashboard.failedToLoad}</div>
          <p className="text-gray-500 text-sm mb-4">{error}</p>
          <Button variant="secondary" onClick={() => refetch(filters)}>
            {dict.dashboard.tryAgain}
          </Button>
        </div>
      ) : filteredBets.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🔍</div>
          <h3 className="text-lg font-semibold text-gray-300 mb-2">{dict.dashboard.noValueBets}</h3>
          <p className="text-gray-500 text-sm">{dict.dashboard.noValueBetsHint}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {filteredBets.map((bet) => (
              <ValueBetCard key={bet.id} bet={bet} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => handlePageChange(currentPage - 1)}
              >
                ← {dict.dashboard.prev}
              </Button>
              <span className="text-sm text-gray-400 px-3">
                {dict.dashboard.page} {currentPage} {dict.dashboard.of} {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
              >
                {dict.dashboard.next} →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
