import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { matchesApi, oddsApi, predictionsApi, valueBetsApi } from '../services/api'
import type { Match, MatchPredictionInsights, OddsHistory, PredictionResult, ValueBet } from '../types'
import { Spinner } from '../components/ui/Spinner'
import { Card, CardHeader, CardBody } from '../components/ui/Card'
import { MatchStats } from '../components/matches/MatchStats'
import { ProbabilityBar } from '../components/matches/ProbabilityBar'
import { OddsEvolutionChart } from '../components/charts/OddsEvolutionChart'
import { ProbabilityComparisonChart } from '../components/charts/ProbabilityComparisonChart'
import { CategoryBadge, StatusBadge } from '../components/ui/Badge'
import { useI18n } from '../hooks/useI18n'

export default function MatchDetail() {
  const { dict } = useI18n()
  const { id } = useParams<{ id: string }>()
  const [match, setMatch] = useState<Match | null>(null)
  const [oddsHistory, setOddsHistory] = useState<OddsHistory[]>([])
  const [prediction, setPrediction] = useState<PredictionResult | null>(null)
  const [insights, setInsights] = useState<MatchPredictionInsights | null>(null)
  const [valueBets, setValueBets] = useState<ValueBet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setIsLoading(true)
    Promise.all([
      matchesApi.getMatch(id),
      oddsApi.getOddsHistory(id).catch(() => [] as OddsHistory[]),
      predictionsApi.getPrediction(id).catch(() => null),
      predictionsApi.getMatchOpportunities(id).catch(() => null),
      valueBetsApi.getValueBets({ page: 1, limit: 50 }).then((r) => r.data.filter((b) => b.matchId === id)).catch(() => []),
    ])
      .then(([matchData, history, pred, matchInsights, bets]) => {
        setMatch(matchData)
        setOddsHistory(history)
        setPrediction(pred)
        setInsights(matchInsights)
        setValueBets(bets)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load match'))
      .finally(() => setIsLoading(false))
  }, [id])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !match) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <p className="text-red-400 mb-2">{dict.matchDetail.failedToLoadMatch}</p>
        <p className="text-gray-500 text-sm">{error}</p>
        <Link to="/dashboard" className="text-blue-400 hover:underline mt-4 block">
          {dict.matchDetail.backToDashboard}
        </Link>
      </div>
    )
  }

  const statusColors: Record<string, string> = {
    live: 'bg-green-700 text-green-200',
    scheduled: 'bg-blue-700 text-blue-200',
    finished: 'bg-gray-700 text-gray-300',
    cancelled: 'bg-red-900 text-red-300',
  }

  const getValueScore = (bet: ValueBet) => bet.valueScore ?? bet.value ?? 0

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Back */}
      <Link to="/dashboard" className="text-sm text-gray-400 hover:text-white flex items-center gap-1">
        {dict.matchDetail.backToDashboard}
      </Link>

      {/* Match Header */}
      <Card>
        <CardBody className="py-6">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mb-3">
              <span>{match.league.country}</span>
              <span>·</span>
              <span>{match.league.name}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[match.status] ?? 'bg-gray-700 text-gray-300'}`}
              >
                {match.status.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                <div className="text-xl font-bold text-white">{match.homeTeam.name}</div>
                <div className="text-sm text-gray-400">{match.homeTeam.shortName}</div>
              </div>
              <div className="text-center">
                {match.homeScore !== undefined && match.awayScore !== undefined ? (
                  <div className="text-3xl font-bold text-blue-400">
                    {match.homeScore} – {match.awayScore}
                  </div>
                ) : (
                  <div className="text-lg text-gray-400">
                    {new Date(match.startTime).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                )}
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-white">{match.awayTeam.name}</div>
                <div className="text-sm text-gray-400">{match.awayTeam.shortName}</div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Stats */}
      {match.stats && (
        <MatchStats
          stats={match.stats}
          homeTeamName={match.homeTeam.name}
          awayTeamName={match.awayTeam.name}
        />
      )}

      {/* Predictions */}
      {prediction && prediction.predictions.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-white">{dict.matchDetail.modelPredictions}</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            {prediction.predictions.map((p) => (
              <ProbabilityBar key={p.outcome} label={p.outcome} probability={p.probability} />
            ))}
          </CardBody>
        </Card>
      )}

      {insights && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-white">{dict.matchDetail.advancedPredictionOpportunities}</h2>
          </CardHeader>
          <CardBody className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-gray-700/30 rounded-lg p-3">
                <div className="text-gray-400">{dict.matchDetail.projectedGoals}</div>
                <div className="text-white font-semibold">{insights.projectedTotals.goals.toFixed(2)}</div>
              </div>
              <div className="bg-gray-700/30 rounded-lg p-3">
                <div className="text-gray-400">{dict.matchDetail.projectedShots}</div>
                <div className="text-white font-semibold">{insights.projectedTotals.shots.toFixed(1)}</div>
              </div>
              <div className="bg-gray-700/30 rounded-lg p-3">
                <div className="text-gray-400">{dict.matchDetail.projectedShotsOnTarget}</div>
                <div className="text-white font-semibold">{insights.projectedTotals.shotsOnTarget.toFixed(1)}</div>
              </div>
              <div className="bg-gray-700/30 rounded-lg p-3">
                <div className="text-gray-400">{dict.matchDetail.projectedCorners}</div>
                <div className="text-white font-semibold">{insights.projectedTotals.corners.toFixed(1)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-gray-700/20 rounded-lg p-3">
                <div className="text-xs uppercase text-gray-400 mb-1">{dict.matchDetail.homeWinProb}</div>
                <div className="text-lg font-semibold text-white">{(insights.winProbabilities.home * 100).toFixed(1)}%</div>
              </div>
              <div className="bg-gray-700/20 rounded-lg p-3">
                <div className="text-xs uppercase text-gray-400 mb-1">{dict.matchDetail.drawProb}</div>
                <div className="text-lg font-semibold text-white">{(insights.winProbabilities.draw * 100).toFixed(1)}%</div>
              </div>
              <div className="bg-gray-700/20 rounded-lg p-3">
                <div className="text-xs uppercase text-gray-400 mb-1">{dict.matchDetail.awayWinProb}</div>
                <div className="text-lg font-semibold text-white">{(insights.winProbabilities.away * 100).toFixed(1)}%</div>
              </div>
            </div>

            {insights.opportunities.length > 0 ? (
              <div className="space-y-2">
                {insights.opportunities.map((opportunity, idx) => (
                  <div key={`${opportunity.market}-${opportunity.selection}-${idx}`} className="rounded-lg border border-gray-700 bg-gray-700/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-white font-medium">{opportunity.market}: {opportunity.selection}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{opportunity.phase === 'live' ? dict.matchDetail.live : opportunity.phase === 'pre-match' ? dict.matchDetail.preMatch : opportunity.phase === 'finished' ? dict.matchDetail.finished : dict.matchDetail.cancelled} | {dict.matchDetail.confidence} {(opportunity.confidence * 100).toFixed(1)}%{opportunity.valueEdge !== undefined ? ` | ${dict.matchDetail.edge} ${(opportunity.valueEdge * 100).toFixed(1)}%` : ''}</div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-300 mt-2">{opportunity.rationale}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">{dict.matchDetail.noOpportunitiesYet}</p>
            )}
          </CardBody>
        </Card>
      )}

      {/* Probability Comparison Chart */}
      {prediction && prediction.predictions.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-white">{dict.matchDetail.modelVsImpliedProbability}</h2>
          </CardHeader>
          <CardBody>
            <ProbabilityComparisonChart predictions={prediction.predictions} />
          </CardBody>
        </Card>
      )}

      {/* Odds Evolution */}
      {oddsHistory.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-white">{dict.matchDetail.oddsEvolution}</h2>
          </CardHeader>
          <CardBody>
            <OddsEvolutionChart history={oddsHistory} />
          </CardBody>
        </Card>
      )}

      {/* Value Bets Table */}
      {valueBets.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-white">{dict.matchDetail.valueBetsForMatch}</h2>
          </CardHeader>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                    <th className="px-5 py-3 text-left">{dict.dashboard.market}</th>
                    <th className="px-5 py-3 text-left">{dict.matchDetail.outcome}</th>
                    <th className="px-5 py-3 text-left">{dict.matchDetail.bookmaker}</th>
                    <th className="px-5 py-3 text-right">{dict.matchDetail.odds}</th>
                    <th className="px-5 py-3 text-right">{dict.matchDetail.modelProbability}</th>
                    <th className="px-5 py-3 text-right">{dict.matchDetail.value}</th>
                    <th className="px-5 py-3 text-center">{dict.matchDetail.category}</th>
                    <th className="px-5 py-3 text-center">{dict.matchDetail.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {valueBets.map((bet) => (
                    <tr key={bet.id} className="border-b border-gray-700 hover:bg-gray-700/30 transition-colors">
                      <td className="px-5 py-3 text-gray-300">{bet.market}</td>
                      <td className="px-5 py-3 text-white font-medium">{bet.outcome}</td>
                      <td className="px-5 py-3 text-gray-300">{bet.bookmaker}</td>
                      <td className="px-5 py-3 text-right text-white">{bet.bookmakerOdds.toFixed(2)}</td>
                      <td className="px-5 py-3 text-right text-green-400">
                        {(bet.modelProbability * 100).toFixed(1)}%
                      </td>
                      <td className="px-5 py-3 text-right text-amber-400">
                        +{(getValueScore(bet) * 100).toFixed(1)}%
                      </td>
                      <td className="px-5 py-3 text-center">
                        <CategoryBadge category={bet.valueCategory ?? bet.classification ?? 'LOW'} />
                      </td>
                      <td className="px-5 py-3 text-center">
                        <StatusBadge status={bet.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
