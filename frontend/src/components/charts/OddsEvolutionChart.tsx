import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { OddsHistory } from '../../types'

interface OddsEvolutionChartProps {
  history: OddsHistory[]
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

export function OddsEvolutionChart({ history }: OddsEvolutionChartProps) {
  // Build unified timeline
  const allTimestamps = Array.from(
    new Set(history.flatMap((h) => h.entries.map((e) => e.timestamp))),
  ).sort()

  const data = allTimestamps.map((ts) => {
    const point: Record<string, string | number> = {
      time: new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    history.forEach((h) => {
      const entry = h.entries.find((e) => e.timestamp === ts)
      if (entry) {
        const key = `${h.bookmaker} (${h.outcome})`
        point[key] = entry.odds
      }
    })
    return point
  })

  const lines = history.map((h, i) => ({
    key: `${h.bookmaker} (${h.outcome})`,
    color: COLORS[i % COLORS.length],
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="time" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <Tooltip
          contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
          labelStyle={{ color: '#e5e7eb' }}
        />
        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
        {lines.map((l) => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            stroke={l.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
