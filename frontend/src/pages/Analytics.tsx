import { useEffect, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts'
import { analyticsApi } from '../services/api'
import type {
  AnalyticsSummary, DailyPerformance, PerformanceByCategory, PerformanceByMarket,
} from '../types'
import { Card, CardHeader, CardBody } from '../components/ui/Card'
import { Spinner } from '../components/ui/Spinner'

const DAY_OPTIONS = [7, 14, 30, 90] as const
type Days = typeof DAY_OPTIONS[number]

interface MetricCardProps {
  label: string
  value: string
  sub?: string
  positive?: boolean
  negative?: boolean
}

function MetricCard({ label, value, sub, positive, negative }: MetricCardProps) {
  const valueClass = positive ? 'text-green-400' : negative ? 'text-red-400' : 'text-white'
  return (
    <Card>
      <CardBody className="py-4">
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</div>
        <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
        {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
      </CardBody>
    </Card>
  )
}

export default function Analytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [daily, setDaily] = useState<DailyPerformance[]>([])
  const [byCategory, setByCategory] = useState<PerformanceByCategory[]>([])
  const [byMarket, setByMarket] = useState<PerformanceByMarket[]>([])
  const [days, setDays] = useState<Days>(30)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortField, setSortField] = useState<keyof PerformanceByMarket>('profit')

  useEffect(() => {
    setIsLoading(true)
    Promise.all([
      analyticsApi.getSummary(),
      analyticsApi.getDailyPerformance(days),
      analyticsApi.getPerformanceByCategory(),
      analyticsApi.getPerformanceByMarket(),
    ])
      .then(([s, d, bc, bm]) => {
        setSummary(s)
        setDaily(d)
        setByCategory(bc)
        setByMarket(bm)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load analytics'))
      .finally(() => setIsLoading(false))
  }, [days])

  const sortedMarkets = [...byMarket].sort((a, b) => {
    const av = a[sortField]
    const bv = b[sortField]
    return typeof av === 'number' && typeof bv === 'number' ? bv - av : 0
  })

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <p className="text-red-400">{error ?? 'No analytics data available'}</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-gray-400 text-sm mt-1">Performance overview and statistics</p>
      </div>

      {/* 8 Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label="Total Bets" value={summary.totalBets.toString()} sub={`${summary.settledBets} settled`} />
        <MetricCard label="Pending Bets" value={summary.pendingBets.toString()} />
        <MetricCard label="Hit Rate" value={`${(summary.hitRate * 100).toFixed(1)}%`} />
        <MetricCard
          label="ROI"
          value={`${summary.roi >= 0 ? '+' : ''}${(summary.roi * 100).toFixed(1)}%`}
          positive={summary.roi > 0}
          negative={summary.roi < 0}
        />
        <MetricCard
          label="Total Profit"
          value={`${summary.totalProfit >= 0 ? '+' : ''}${summary.totalProfit.toFixed(2)}`}
          positive={summary.totalProfit > 0}
          negative={summary.totalProfit < 0}
        />
        <MetricCard label="Yield" value={`${(summary.yield * 100).toFixed(1)}%`} />
        <MetricCard label="Avg Odds" value={summary.averageOdds.toFixed(2)} />
        <MetricCard label="Avg Value" value={`+${(summary.averageValue * 100).toFixed(1)}%`} positive />
      </div>

      {/* Value Category Distribution */}
      <Card>
        <CardHeader><h2 className="font-semibold text-white">Value Category Distribution</h2></CardHeader>
        <CardBody>
          <div className="flex gap-6">
            {[
              { label: 'HIGH', count: summary.highValueBets, color: 'text-red-400' },
              { label: 'MEDIUM', count: summary.mediumValueBets, color: 'text-amber-400' },
              { label: 'LOW', count: summary.lowValueBets, color: 'text-gray-300' },
            ].map((cat) => (
              <div key={cat.label} className="text-center flex-1 bg-gray-700/40 rounded-xl py-4">
                <div className={`text-3xl font-bold ${cat.color}`}>{cat.count}</div>
                <div className="text-xs text-gray-400 mt-1">{cat.label}</div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Cumulative P&L Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">Cumulative P&L</h2>
            <div className="flex gap-1">
              {DAY_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    days === d ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={daily} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
              <Line type="monotone" dataKey="cumulativeProfit" name="Cumulative P&L" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {/* Daily ROI Bar Chart */}
      <Card>
        <CardHeader><h2 className="font-semibold text-white">Daily ROI</h2></CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={daily} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <YAxis unit="%" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => [`${value.toFixed(1)}%`, 'ROI']}
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Bar dataKey="roi" name="Daily ROI" radius={[3, 3, 0, 0]}>
                {daily.map((entry, index) => (
                  <Cell key={index} fill={entry.roi >= 0 ? '#22c55e' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {/* Performance by Category */}
      {byCategory.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Performance by Category</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {byCategory.map((cat) => (
              <Card key={cat.category}>
                <CardBody>
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">{cat.category}</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-gray-400">Bets</span><span className="text-white">{cat.bets}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Won</span><span className="text-white">{cat.won}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Hit Rate</span><span className="text-white">{(cat.hitRate * 100).toFixed(1)}%</span></div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">ROI</span>
                      <span className={cat.roi >= 0 ? 'text-green-400' : 'text-red-400'}>{(cat.roi * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Profit</span>
                      <span className={cat.profit >= 0 ? 'text-green-400' : 'text-red-400'}>{cat.profit >= 0 ? '+' : ''}{cat.profit.toFixed(2)}</span>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Performance by Market Chart */}
      {byMarket.length > 0 && (
        <Card>
          <CardHeader><h2 className="font-semibold text-white">Performance by Market</h2></CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byMarket} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis type="category" dataKey="market" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#e5e7eb' }}
                />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                <Bar dataKey="profit" name="Profit" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      )}

      {/* Market Breakdown Table */}
      {sortedMarkets.length > 0 && (
        <Card>
          <CardHeader><h2 className="font-semibold text-white">Market Breakdown</h2></CardHeader>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-xs text-gray-400 uppercase">
                    {(['market', 'bets', 'won', 'hitRate', 'roi', 'profit'] as (keyof PerformanceByMarket)[]).map((col) => (
                      <th
                        key={col}
                        className="px-5 py-3 text-left cursor-pointer hover:text-white transition-colors"
                        onClick={() => setSortField(col)}
                      >
                        {col === 'hitRate' ? 'Hit Rate' : col.charAt(0).toUpperCase() + col.slice(1)}
                        {sortField === col && ' ↓'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedMarkets.map((m) => (
                    <tr key={m.market} className="border-b border-gray-700 hover:bg-gray-700/30">
                      <td className="px-5 py-3 text-white font-medium">{m.market}</td>
                      <td className="px-5 py-3 text-gray-300">{m.bets}</td>
                      <td className="px-5 py-3 text-gray-300">{m.won}</td>
                      <td className="px-5 py-3 text-gray-300">{(m.hitRate * 100).toFixed(1)}%</td>
                      <td className={`px-5 py-3 font-medium ${m.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(m.roi * 100).toFixed(1)}%
                      </td>
                      <td className={`px-5 py-3 font-medium ${m.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {m.profit >= 0 ? '+' : ''}{m.profit.toFixed(2)}
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
