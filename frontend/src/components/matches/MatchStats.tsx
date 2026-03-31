import { Card, CardHeader, CardBody } from '../ui/Card'
import { TeamAvatar } from './TeamAvatar'
import type { MatchStats as MatchStatsType } from '../../types'

interface MatchStatsProps {
  stats: MatchStatsType
  homeTeamName: string
  awayTeamName: string
  homeTeamLogo?: string
  awayTeamLogo?: string
}

function FormPill({ result }: { result: string }) {
  const color =
    result === 'W'
      ? 'bg-green-600 text-white'
      : result === 'L'
        ? 'bg-red-600 text-white'
        : 'bg-gray-600 text-gray-200'
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${color}`}>
      {result}
    </span>
  )
}

function StatRow({ label, home, away }: { label: string; home: string | number | undefined; away: string | number | undefined }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
      <span className="text-sm font-medium text-white w-16 text-left">{home ?? '—'}</span>
      <span className="text-xs text-gray-400 flex-1 text-center">{label}</span>
      <span className="text-sm font-medium text-white w-16 text-right">{away ?? '—'}</span>
    </div>
  )
}

export function MatchStats({ stats, homeTeamName, awayTeamName, homeTeamLogo, awayTeamLogo }: MatchStatsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-white flex items-center gap-2">
            <TeamAvatar name={homeTeamName} logo={homeTeamLogo} size="sm" />
            <span>{homeTeamName}</span>
          </span>
          <span className="text-xs text-gray-400">Match Stats</span>
          <span className="font-semibold text-white flex items-center gap-2">
            <TeamAvatar name={awayTeamName} logo={awayTeamLogo} size="sm" />
            <span>{awayTeamName}</span>
          </span>
        </div>
      </CardHeader>
      <CardBody className="p-0 px-5">
        <StatRow label="xG" home={stats.homeXG?.toFixed(2)} away={stats.awayXG?.toFixed(2)} />
        <StatRow label="Shots" home={stats.homeShots} away={stats.awayShots} />
        <StatRow
          label="Possession"
          home={stats.homePossession !== undefined ? `${stats.homePossession}%` : undefined}
          away={stats.awayPossession !== undefined ? `${stats.awayPossession}%` : undefined}
        />
        <div className="flex items-center justify-between py-2">
          <div className="flex gap-1">
            {stats.homeForm?.map((r, i) => <FormPill key={i} result={r} />)}
          </div>
          <span className="text-xs text-gray-400">Form</span>
          <div className="flex gap-1">
            {stats.awayForm?.map((r, i) => <FormPill key={i} result={r} />)}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
