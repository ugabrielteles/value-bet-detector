import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { matchesApi, oddsApi, predictionsApi, valueBetsApi } from '../services/api'
import type { Match, OddsHistory, PredictionResult, ValueBet } from '../types'
import { Spinner } from '../components/ui/Spinner'
import { Card, CardHeader, CardBody } from '../components/ui/Card'
import { MatchStats } from '../components/matches/MatchStats'
import { ProbabilityBar } from '../components/matches/ProbabilityBar'
import { OddsEvolutionChart } from '../components/charts/OddsEvolutionChart'
import { ProbabilityComparisonChart } from '../components/charts/ProbabilityComparisonChart'
import { CategoryBadge, StatusBadge } from '../components/ui/Badge'

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>()
  const [match, setMatch] = useState<Match | null>(null)
  const [oddsHistory, setOddsHistory] = useState<OddsHistory[]>([])
  const [prediction, setPrediction] = useState<PredictionResult | null>(null)
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
      valueBetsApi.getValueBets({ page: 1, limit: 50 }).then((r) => r.data.filter((b) => b.matchId === id)).catch(() => []),
    ])
      .then(([matchData, history, pred, bets]) => {
        setMatch(matchData)
        setOddsHistory(history)
        setPrediction(pred)
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
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-red-400 mb-2">Failed to load match details</p>
        <p className="text-gray-500 text-sm">{error}</p>
        <Link to="/dashboard" className="text-blue-400 hover:underline mt-4 block">
          ← Back to Dashboard
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Back */}
      <Link to="/dashboard" className="text-sm text-gray-400 hover:text-white flex items-center gap-1">
        ← Back to Dashboard
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
            <h2 className="font-semibold text-white">Model Predictions</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            {prediction.predictions.map((p) => (
              <ProbabilityBar key={p.outcome} label={p.outcome} probability={p.probability} />
            ))}
          </CardBody>
        </Card>
      )}

      {/* Probability Comparison Chart */}
      {prediction && prediction.predictions.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-white">Model vs Implied Probability</h2>
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
            <h2 className="font-semibold text-white">Odds Evolution</h2>
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
            <h2 className="font-semibold text-white">Value Bets for This Match</h2>
          </CardHeader>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                    <th className="px-5 py-3 text-left">Market</th>
                    <th className="px-5 py-3 text-left">Outcome</th>
                    <th className="px-5 py-3 text-left">Bookmaker</th>
                    <th className="px-5 py-3 text-right">Odds</th>
                    <th className="px-5 py-3 text-right">Model%</th>
                    <th className="px-5 py-3 text-right">Value</th>
                    <th className="px-5 py-3 text-center">Category</th>
                    <th className="px-5 py-3 text-center">Status</th>
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
                        +{(bet.valueScore * 100).toFixed(1)}%
                      </td>
                      <td className="px-5 py-3 text-center">
                        <CategoryBadge category={bet.valueCategory} />
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
