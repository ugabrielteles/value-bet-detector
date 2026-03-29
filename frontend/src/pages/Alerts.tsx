import { useState, useEffect } from 'react'
import { useValueBetsStore } from '../store/valueBetsStore'
import { valueBetsApi } from '../services/api'
import type { ValueBet, BetStatus, ValueCategory } from '../types'
import { CategoryBadge, StatusBadge } from '../components/ui/Badge'
import { Select } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { Link } from 'react-router-dom'
import { getBookmakerLink } from '../services/bookmakerLinks'

type SortKey = 'valueScore' | 'bookmakerOdds' | 'detectedAt'

const getValueScore = (bet: ValueBet) => bet.valueScore ?? bet.value ?? 0

export default function Alerts() {
  const newAlertsCount = useValueBetsStore((s) => s.newAlertsCount)
  const clearNewAlerts = useValueBetsStore((s) => s.clearNewAlerts)

  const [bets, setBets] = useState<ValueBet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<BetStatus | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<ValueCategory | 'all'>('all')
  const [sortBy, setSortBy] = useState<SortKey>('valueScore')

  useEffect(() => {
    clearNewAlerts()
  }, [clearNewAlerts])

  useEffect(() => {
    setIsLoading(true)
    valueBetsApi
      .getValueBets({
        status: statusFilter === 'all' ? undefined : statusFilter,
        category: categoryFilter === 'all' ? undefined : categoryFilter,
        page: 1,
        limit: 100,
      })
      .then((r) => setBets(r.data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load alerts'))
      .finally(() => setIsLoading(false))
  }, [statusFilter, categoryFilter])

  const sorted = [...bets].sort((a, b) => {
    if (sortBy === 'valueScore') return getValueScore(b) - getValueScore(a)
    if (sortBy === 'bookmakerOdds') return b.bookmakerOdds - a.bookmakerOdds
    return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            Alerts
            {newAlertsCount > 0 && (
              <span className="bg-red-500 text-white text-sm rounded-full px-2.5 py-0.5 font-bold">
                {newAlertsCount} new
              </span>
            )}
          </h1>
          <p className="text-gray-400 text-sm mt-1">{bets.length} alerts total</p>
        </div>
        {newAlertsCount > 0 && (
          <Button variant="secondary" size="sm" onClick={clearNewAlerts}>
            Mark all as read
          </Button>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6 bg-gray-800 border border-gray-700 rounded-xl p-4">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as BetStatus | 'all')}
          className="w-36"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
          <option value="void">Void</option>
        </Select>
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as ValueCategory | 'all')}
          className="w-40"
        >
          <option value="all">All Categories</option>
          <option value="HIGH">High Value</option>
          <option value="MEDIUM">Medium Value</option>
          <option value="LOW">Low Value</option>
        </Select>
        <div className="ml-auto flex items-center gap-2 text-sm text-gray-400">
          Sort by:
          {(['valueScore', 'bookmakerOdds', 'detectedAt'] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                sortBy === key ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {key === 'valueScore' ? 'Value' : key === 'bookmakerOdds' ? 'Odds' : 'Date'}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="text-center py-20 text-red-400">{error}</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-4">🔔</div>
          <h3 className="text-lg font-semibold text-gray-300">No alerts found</h3>
          <p className="text-gray-500 text-sm mt-2">Try different filters</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((bet) => {
            const bookmakerLink = getBookmakerLink(bet.bookmaker, bet.bookmakerUrl)
            return (
              <div
                key={bet.id}
                className="bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-xl p-4 transition-colors"
              >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/matches/${bet.matchId}`}
                    className="text-sm font-semibold text-white hover:text-blue-400 transition-colors"
                  >
                    {bet.match?.homeTeam?.name ?? 'Home Team'} vs {bet.match?.awayTeam?.name ?? 'Away Team'}
                  </Link>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {bet.match?.league?.name ?? 'Unknown League'} · {bet.market} · {bet.outcome} · {
                      bookmakerLink ? (
                        <a
                          href={bookmakerLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400 hover:text-blue-300"
                        >
                          {bet.bookmaker}
                        </a>
                      ) : (
                        bet.bookmaker
                      )
                    }
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold text-amber-400">+{(getValueScore(bet) * 100).toFixed(1)}%</span>
                  <span className="text-sm text-white">{bet.bookmakerOdds.toFixed(2)}</span>
                  <CategoryBadge category={bet.valueCategory ?? bet.classification ?? 'LOW'} />
                  <StatusBadge status={bet.status} />
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Detected {new Date(bet.detectedAt).toLocaleString()}
              </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
