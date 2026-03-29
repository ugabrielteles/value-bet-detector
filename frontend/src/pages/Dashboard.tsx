import { useEffect, useState } from 'react'
import { useValueBetsStore } from '../store/valueBetsStore'
import { useValueBets } from '../hooks/useValueBets'
import { useWebSocket } from '../hooks/useWebSocket'
import { ValueBetCard } from '../components/dashboard/ValueBetCard'
import { FiltersBar } from '../components/dashboard/FiltersBar'
import { Spinner } from '../components/ui/Spinner'
import { Button } from '../components/ui/Button'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import type { MatchPredictionInsights, ValueBetFilters } from '../types'
import { useI18n } from '../hooks/useI18n'
import { predictionsApi } from '../services/api'
import { Link } from 'react-router-dom'

type OpportunitiesCoverage = 'all' | 'top-countries' | 'international'

const TOP_COUNTRIES = [
  'England',
  'Spain',
  'Italy',
  'Germany',
  'France',
  'Portugal',
  'Netherlands',
  'Brazil',
  'Argentina',
  'United States',
  'USA',
  'Belgium',
]

const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const formatMatchDate = (date?: string): string => {
  if (!date) return '--'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return '--'
  return parsed.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Dashboard() {
  const [filters, setFilters] = useState<ValueBetFilters>({ status: 'all', category: 'all', page: 1, limit: 20 })
  const { isConnected } = useWebSocket()

  const newAlertsCount = useValueBetsStore((s) => s.newAlertsCount)
  const clearNewAlerts = useValueBetsStore((s) => s.clearNewAlerts)
  const { dict } = useI18n()
  const [todayInsights, setTodayInsights] = useState<MatchPredictionInsights[]>([])
  const [loadingInsights, setLoadingInsights] = useState(true)
  const [coverage, setCoverage] = useState<OpportunitiesCoverage>('all')
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [leagueIdsInput, setLeagueIdsInput] = useState('')

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

  useEffect(() => {
    setLoadingInsights(true)

    const leagueIds = splitCsv(leagueIdsInput)

    const filters =
      coverage === 'top-countries'
        ? { countries: TOP_COUNTRIES, limit: 30 }
        : coverage === 'international'
          ? { internationalOnly: true, limit: 30 }
          : {
              countries: selectedCountries.length > 0 ? selectedCountries : undefined,
              leagueIds: leagueIds.length > 0 ? leagueIds : undefined,
              limit: 30,
            }

    predictionsApi
      .getTodayOpportunities(filters)
      .then(setTodayInsights)
      .catch(() => setTodayInsights([]))
      .finally(() => setLoadingInsights(false))
  }, [coverage, leagueIdsInput, selectedCountries])

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

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-white">{dict.dashboard.todayOpportunities}</h2>
            <select
              value={coverage}
              onChange={(e) => setCoverage(e.target.value as OpportunitiesCoverage)}
              className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">{dict.dashboard.allCompetitions}</option>
              <option value="top-countries">{dict.dashboard.topCountries}</option>
              <option value="international">{dict.dashboard.internationalOnly}</option>
            </select>
          </div>
        </CardHeader>
        <CardBody>
          {coverage === 'all' && (
            <div className="mb-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-400">{dict.dashboard.countries}</span>
                <select
                  multiple
                  value={selectedCountries}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions).map((option) => option.value)
                    setSelectedCountries(values)
                  }}
                  className="mt-1 h-28 w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TOP_COUNTRIES.map((country) => (
                    <option key={country} value={country}>{country}</option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">{dict.dashboard.leaveEmpty}</p>
              </label>

              <label className="block">
                <span className="text-xs text-gray-400">{dict.dashboard.leagueIds}</span>
                <input
                  value={leagueIdsInput}
                  onChange={(e) => setLeagueIdsInput(e.target.value)}
                  placeholder="e.g. 39, 140, 61"
                  className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">{dict.dashboard.optionalFilter}</p>
              </label>
            </div>
          )}

          {loadingInsights ? (
            <div className="py-4"><Spinner size="sm" /></div>
          ) : todayInsights.length === 0 ? (
            <p className="text-sm text-gray-400">No opportunities found for today.</p>
          ) : (
            <div className="space-y-3">
              {todayInsights.slice(0, 6).map((insight) => {
                const top = [...insight.opportunities].sort((a, b) => b.confidence - a.confidence)[0]
                const confidenceColor = top && top.confidence >= 0.75 ? 'bg-green-900' : top && top.confidence >= 0.65 ? 'bg-yellow-900' : 'bg-orange-900'
                const confidenceText = top && top.confidence >= 0.75 ? 'text-green-400' : top && top.confidence >= 0.65 ? 'text-yellow-400' : 'text-orange-400'
                
                return (
                  <Link key={insight.matchId} to={`/matches/${insight.matchId}`} className="group block rounded-lg border border-gray-600 bg-gradient-to-br from-gray-700/40 to-gray-700/20 p-4 hover:border-blue-500 transition-all hover:shadow-lg">
                    {/* Header Row */}
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">{formatMatchDate(insight.matchStartTime)}</div>
                        <div className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          insight.matchStatus === 'live' ? 'bg-red-900/60 text-red-300' :
                          insight.matchStatus === 'scheduled' ? 'bg-blue-900/60 text-blue-300' :
                          'bg-gray-700 text-gray-300'
                        }`}>
                          {insight.matchStatus.toUpperCase()}
                        </div>
                      </div>
                      {top && (
                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${confidenceColor} ${confidenceText}`}>
                          {(top.confidence * 100).toFixed(0)}% CONFIDENT
                        </span>
                      )}
                    </div>

                    {/* Teams Display - PROMINENT */}
                    <div className="mb-3 pb-3 border-b border-gray-600">
                      <div className="text-sm font-bold text-white text-center">
                        {insight.homeTeamName ? (
                          <>
                            <span>{insight.homeTeamName}</span>
                            <span className="mx-2 text-gray-400">vs</span>
                            <span>{insight.awayTeamName}</span>
                          </>
                        ) : (
                          <span className="text-gray-400">Match {insight.matchId.slice(0, 8)}</span>
                        )}
                      </div>
                    </div>

                    {top ? (
                      <>
                        {/* Main Action - What to Bet */}
                        <div className="mb-3 p-3 rounded-lg bg-gradient-to-r from-blue-900/40 to-blue-900/20 border border-blue-700/50">
                          <div className="text-xs text-blue-300 font-semibold mb-1 uppercase tracking-wide">{dict.dashboard.whatToBet}</div>
                          <div className="text-lg font-bold text-white mb-1">{top.selection}</div>
                          <div className="text-xs text-gray-400">{dict.dashboard.market}: <span className="text-gray-300">{top.market}</span></div>
                        </div>

                        {/* Why This Bet */}
                        <div className="text-xs text-gray-300 leading-relaxed border-l-2 border-blue-500/50 pl-2 mb-3 italic">
                          "{top.rationale}"
                        </div>

                        {/* Phase indicator */}
                        <div className="flex items-center gap-2 pt-2 border-t border-gray-700">
                          {top.phase === 'live' ? (
                            <span className="text-xs text-red-400 font-semibold">● LIVE MARKET</span>
                          ) : (
                            <span className="text-xs text-gray-400">{dict.dashboard.preBet}</span>
                          )}
                          <span className="text-blue-400 text-xs font-medium group-hover:text-blue-200 ml-auto">{dict.dashboard.viewDetails}</span>
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-gray-400 py-2">No opportunities identified yet for this match.</div>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
        </CardBody>
      </Card>

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
