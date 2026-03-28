import { Link } from 'react-router-dom'
import { Card, CardBody } from '../ui/Card'
import { CategoryBadge, StatusBadge } from '../ui/Badge'
import type { ValueBet } from '../../types'

interface ValueBetCardProps {
  bet: ValueBet
}

function formatMarket(market: string): string {
  switch (market) {
    case '1X2': return '1X2'
    case 'over_under': return 'Over/Under'
    case 'both_teams_score': return 'BTTS'
    case 'asian_handicap': return 'Asian Handicap'
    default: return market
  }
}

export function ValueBetCard({ bet }: ValueBetCardProps) {
  const { match } = bet
  const detectedDate = new Date(bet.detectedAt)

  return (
    <Card className="hover:border-gray-600 transition-colors">
      <CardBody className="p-4">
        {/* Teams & League */}
        <Link to={`/matches/${match.id}`} className="block mb-3 group">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">{match.league.name}</span>
            <span className="text-xs text-gray-500">{match.league.country}</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm font-semibold group-hover:text-blue-400 transition-colors">
            <span className="truncate max-w-[100px] text-right">{match.homeTeam.name}</span>
            <span className="text-gray-500 text-xs shrink-0">vs</span>
            <span className="truncate max-w-[100px]">{match.awayTeam.name}</span>
          </div>
          {(match.homeScore !== undefined && match.awayScore !== undefined) && (
            <div className="text-center text-sm font-bold text-blue-400 mt-1">
              {match.homeScore} – {match.awayScore}
            </div>
          )}
        </Link>

        {/* Market & Outcome */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
            {formatMarket(bet.market)}
          </span>
          <span className="text-xs font-medium text-white">{bet.outcome}</span>
        </div>

        {/* Probabilities & Odds */}
        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
          <div className="bg-gray-700/50 rounded-lg p-2">
            <div className="text-xs text-gray-400 mb-0.5">Model Prob.</div>
            <div className="text-sm font-bold text-green-400">
              {(bet.modelProbability * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-2">
            <div className="text-xs text-gray-400 mb-0.5">Odds</div>
            <div className="text-sm font-bold text-white">{bet.bookmakerOdds.toFixed(2)}</div>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-2">
            <div className="text-xs text-gray-400 mb-0.5">Value</div>
            <div className="text-sm font-bold text-amber-400">
              +{(bet.valueScore * 100).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CategoryBadge category={bet.valueCategory} />
            <StatusBadge status={bet.status} />
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">{bet.bookmaker}</div>
            <div className="text-xs text-gray-500">
              {detectedDate.toLocaleDateString()} {detectedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
