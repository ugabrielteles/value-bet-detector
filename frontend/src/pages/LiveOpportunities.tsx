import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { predictionsApi } from '../services/api'
import type { OpportunityMarketStats, PersistedPredictionOpportunity } from '../types'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { useI18n } from '../hooks/useI18n'

const AUTO_REFRESH_MS = 30000
type Coverage = 'all' | 'top-countries' | 'international'

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

export default function LiveOpportunities() {
  const { dict } = useI18n()
  const [opportunities, setOpportunities] = useState<PersistedPredictionOpportunity[]>([])
  const [stats, setStats] = useState<OpportunityMarketStats[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coverage, setCoverage] = useState<Coverage>('all')
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [leagueIdsInput, setLeagueIdsInput] = useState('')

  const load = async (background = false) => {
    if (!background) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }

    setError(null)
    try {
      const leagueIds = splitCsv(leagueIdsInput)

      const filters =
        coverage === 'top-countries'
          ? { countries: TOP_COUNTRIES, limit: 80 }
          : coverage === 'international'
            ? { internationalOnly: true, limit: 80 }
            : {
                countries: selectedCountries.length > 0 ? selectedCountries : undefined,
                leagueIds: leagueIds.length > 0 ? leagueIds : undefined,
                limit: 80,
              }

      const [live, byMarket] = await Promise.all([
        predictionsApi.getLiveOpportunities(filters),
        predictionsApi.getOpportunityStats(),
      ])
      setOpportunities(live)
      setStats(byMarket)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load live opportunities')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
    const interval = setInterval(() => {
      void load(true)
    }, AUTO_REFRESH_MS)

    return () => clearInterval(interval)
  }, [coverage, leagueIdsInput, selectedCountries])

  const grouped = useMemo(() => {
    const map = new Map<string, PersistedPredictionOpportunity[]>()
    for (const row of opportunities) {
      const key = row.matchId
      const prev = map.get(key) ?? []
      prev.push(row)
      map.set(key, prev)
    }
    return Array.from(map.entries()).map(([matchId, list]) => ({
      matchId,
      matchStartTime: list[0]?.matchStartTime,
      items: list.sort((a, b) => b.confidence - a.confidence),
    }))
  }, [opportunities])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{dict.liveOpportunities.title}</h1>
          <p className="text-sm text-gray-400 mt-1">{dict.liveOpportunities.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={coverage}
            onChange={(e) => setCoverage(e.target.value as Coverage)}
            className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">{dict.liveOpportunities.allCompetitions}</option>
            <option value="top-countries">{dict.liveOpportunities.topCountries}</option>
            <option value="international">{dict.liveOpportunities.internationalOnly}</option>
          </select>
          {isRefreshing && <span className="text-xs text-gray-400">{dict.liveOpportunities.refreshing}</span>}
          <Button variant="secondary" onClick={() => void load(true)}>{dict.liveOpportunities.refreshNow}</Button>
        </div>
      </div>

      {coverage === 'all' && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-white">{dict.liveOpportunities.customCoverageFilters}</h2>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-400">{dict.liveOpportunities.countries}</span>
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
                <p className="text-[11px] text-gray-500 mt-1">{dict.liveOpportunities.leaveEmpty}</p>
              </label>

              <label className="block">
                <span className="text-xs text-gray-400">{dict.liveOpportunities.leagueIds}</span>
                <input
                  value={leagueIdsInput}
                  onChange={(e) => setLeagueIdsInput(e.target.value)}
                  placeholder="e.g. 39, 140, 61"
                  className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">{dict.liveOpportunities.optionalFilter}</p>
              </label>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-white">{dict.liveOpportunities.marketAccuracy}</h2>
        </CardHeader>
        <CardBody>
          {stats.length === 0 ? (
            <p className="text-sm text-gray-400">{dict.liveOpportunities.noStats}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {stats.slice(0, 8).map((row) => (
                <div key={row.market} className="rounded-lg border border-gray-700 bg-gray-700/20 p-3">
                  <div className="text-xs uppercase text-gray-400">{row.market}</div>
                  <div className="text-xl font-semibold text-white mt-1">{(row.hitRate * 100).toFixed(1)}%</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {row.won}W / {row.lost}L / {row.pending}P ({row.total} total)
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-white">{dict.liveOpportunities.title}</h2>
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <div className="py-10 flex justify-center"><Spinner size="lg" /></div>
          ) : error ? (
            <div className="rounded-lg border border-red-700 bg-red-900/20 px-4 py-3 text-red-300 text-sm">{error}</div>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-gray-400">{dict.liveOpportunities.noOpportunities}</p>
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => (
                <Link key={group.matchId} to={`/matches/${group.matchId}`} className="group block">
                  <div className="rounded-lg border border-gray-600 bg-gradient-to-r from-gray-700/50 to-gray-700/30 hover:from-gray-700 hover:to-gray-700/50 transition-all p-4">
                    {/* Match Header Section with TEAMS */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="text-sm font-bold text-white mb-1">
                          {group.items[0]?.homeTeamName ? (
                            <>
                              <span>{group.items[0].homeTeamName}</span>
                              <span className="mx-2 text-gray-400 text-xs">vs</span>
                              <span>{group.items[0].awayTeamName}</span>
                            </>
                          ) : (
                            <span>Match {group.matchId.slice(0, 8)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-red-900/70 text-red-300 px-2 py-0.5 rounded-full font-semibold">● LIVE</span>
                          <span className="text-xs text-gray-400">🕐 {formatMatchDate(group.matchStartTime)}</span>
                        </div>
                      </div>
                      <span className="text-blue-400 text-xs font-medium group-hover:text-blue-200 transition-colors">Details →</span>
                    </div>

                    {/* Opportunities Grid */}
                    <div className="space-y-2">
                      {group.items.slice(0, 3).map((item) => {
                        const confidenceColor = item.confidence >= 0.75 ? 'from-green-900/50 to-green-900/20 border-green-700/50' : 
                                               item.confidence >= 0.65 ? 'from-yellow-900/50 to-yellow-900/20 border-yellow-700/50' : 
                                               'from-orange-900/50 to-orange-900/20 border-orange-700/50'
                        const confidenceBg = item.confidence >= 0.75 ? 'bg-green-900 text-green-300' :
                                            item.confidence >= 0.65 ? 'bg-yellow-900 text-yellow-300' :
                                            'bg-orange-900 text-orange-300'
                        const resultColor = item.result === 'won' ? 'bg-green-900/40 border-green-700 text-green-300' :
                                           item.result === 'lost' ? 'bg-red-900/40 border-red-700 text-red-300' :
                                           'bg-gray-700/40 border-gray-600 text-gray-300'
                        const resultIcon = item.result === 'won' ? '✓' : item.result === 'lost' ? '✗' : '○'

                        return (
                          <div key={item._id} className={`rounded-lg bg-gradient-to-r ${confidenceColor} border px-3 py-2.5 transition-all`}>
                            {/* Opportunity Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="text-sm font-bold text-white">{item.selection}</div>
                                <div className="text-xs text-gray-400 mt-0.5">{dict.dashboard.market}: <span className="text-gray-300">{item.market}</span></div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${confidenceBg}`}>
                                  {(item.confidence * 100).toFixed(0)}%
                                </span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded border ${resultColor}`}>
                                  {resultIcon} {item.result === 'won' ? dict.liveOpportunities.won : item.result === 'lost' ? dict.liveOpportunities.lost : dict.liveOpportunities.pending}
                                </span>
                              </div>
                            </div>

                            {/* Rationale */}
                            <p className="text-xs text-gray-300 mt-2 leading-relaxed border-l-2 border-blue-500/60 pl-2">
                              {item.rationale}
                            </p>

                            {/* Meta Footer */}
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700/50 text-xs text-gray-400">
                              <div className="flex items-center gap-2">
                                {item.phase === 'live' ? (
                                  <>
                                    <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                                    <span className="text-red-400 font-medium">{dict.liveOpportunities.liveMarket}</span>
                                  </>
                                ) : (
                                  <span>{dict.liveOpportunities.preMatch}</span>
                                )}
                              </div>
                              {item.valueEdge !== undefined && (
                                <span className="text-blue-400">{dict.liveOpportunities.edge}: +{(item.valueEdge * 100).toFixed(1)}%</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Show more indicator */}
                    {group.items.length > 3 && (
                      <div className="text-xs text-gray-500 mt-3 text-center">{group.items.length - 3} {dict.liveOpportunities.moreOpportunities}</div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
