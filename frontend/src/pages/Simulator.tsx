import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { simulatorApi } from '../services/api'
import type { Simulation, RunSimulationParams, SimulationChartPoint, SimulationStrategy } from '../types'
import { Card, CardHeader, CardBody } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Input'
import { Spinner } from '../components/ui/Spinner'
import { StatusBadge } from '../components/ui/Badge'

interface MetricCardProps { label: string; value: string; positive?: boolean; negative?: boolean }
function MetricCard({ label, value, positive, negative }: MetricCardProps) {
  const cls = positive ? 'text-green-400' : negative ? 'text-red-400' : 'text-white'
  return (
    <Card>
      <CardBody className="py-3">
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</div>
        <div className={`text-xl font-bold ${cls}`}>{value}</div>
      </CardBody>
    </Card>
  )
}

export default function Simulator() {
  const [simulations, setSimulations] = useState<Simulation[]>([])
  const [selected, setSelected] = useState<Simulation | null>(null)
  const [chartData, setChartData] = useState<SimulationChartPoint[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isLoadingSims, setIsLoadingSims] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form
  const [name, setName] = useState('')
  const [initialBankroll, setInitialBankroll] = useState(1000)
  const [strategy, setStrategy] = useState<SimulationStrategy>('flat')
  const [flatStake, setFlatStake] = useState(10)
  const [percentageStake, setPercentageStake] = useState(2)
  const [kellyFraction, setKellyFraction] = useState(0.25)
  const [minOdds, setMinOdds] = useState(1.5)
  const [maxOdds, setMaxOdds] = useState(10)
  const [minValue, setMinValue] = useState(5)
  const [onlyHighValue, setOnlyHighValue] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    simulatorApi.getSimulations()
      .then(setSimulations)
      .catch(() => {})
      .finally(() => setIsLoadingSims(false))
  }, [])

  const loadSimulation = async (sim: Simulation) => {
    setSelected(sim)
    try {
      const chart = await simulatorApi.getSimulationChart(sim.id)
      setChartData(chart)
    } catch {
      setChartData([])
    }
  }

  const handleRun = async () => {
    setIsRunning(true)
    setError(null)
    const params: RunSimulationParams = {
      name: name || undefined,
      initialBankroll,
      strategy,
      flatStakeAmount: strategy === 'flat' ? flatStake : undefined,
      percentageStake: strategy === 'percentage' ? percentageStake : undefined,
      kellyFraction: strategy === 'kelly' ? kellyFraction : undefined,
      minOdds,
      maxOdds,
      minValue: minValue / 100,
      onlyHighValue,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }
    try {
      const sim = await simulatorApi.runSimulation(params)
      setSimulations((prev) => [sim, ...prev])
      await loadSimulation(sim)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Simulator</h1>
        <p className="text-gray-400 text-sm mt-1">Backtest your strategy on historical value bets</p>
      </div>

      <div className="flex gap-6">
        {/* Left panel: config + previous sims */}
        <div className="w-80 shrink-0 space-y-4">
          {/* Config */}
          <Card>
            <CardHeader><h2 className="font-semibold text-white text-sm">Configuration</h2></CardHeader>
            <CardBody className="space-y-3">
              <Input label="Name" placeholder="My Simulation" value={name} onChange={(e) => setName(e.target.value)} />
              <Input
                label="Initial Bankroll"
                type="number" min="100"
                value={initialBankroll}
                onChange={(e) => setInitialBankroll(parseFloat(e.target.value) || 0)}
              />
              <Select label="Strategy" value={strategy} onChange={(e) => setStrategy(e.target.value as SimulationStrategy)}>
                <option value="flat">Flat Stake</option>
                <option value="kelly">Kelly Criterion</option>
                <option value="percentage">Percentage</option>
              </Select>
              {strategy === 'flat' && (
                <Input label="Flat Stake" type="number" min="1" value={flatStake} onChange={(e) => setFlatStake(parseFloat(e.target.value) || 0)} />
              )}
              {strategy === 'percentage' && (
                <Input label="Stake %" type="number" min="0.1" max="100" step="0.5" value={percentageStake} onChange={(e) => setPercentageStake(parseFloat(e.target.value) || 0)} />
              )}
              {strategy === 'kelly' && (
                <Input label="Kelly Fraction" type="number" min="0.05" max="1" step="0.05" value={kellyFraction} onChange={(e) => setKellyFraction(parseFloat(e.target.value) || 0)} />
              )}
              <div className="grid grid-cols-2 gap-2">
                <Input label="Min Odds" type="number" step="0.1" min="1" value={minOdds} onChange={(e) => setMinOdds(parseFloat(e.target.value) || 0)} />
                <Input label="Max Odds" type="number" step="0.5" value={maxOdds} onChange={(e) => setMaxOdds(parseFloat(e.target.value) || 0)} />
              </div>
              <Input label="Min Value %" type="number" min="0" step="1" value={minValue} onChange={(e) => setMinValue(parseFloat(e.target.value) || 0)} />
              <div className="flex items-center gap-2">
                <input type="checkbox" id="highOnly" checked={onlyHighValue} onChange={(e) => setOnlyHighValue(e.target.checked)} className="w-4 h-4 accent-blue-500" />
                <label htmlFor="highOnly" className="text-sm text-gray-300">High Value Only</label>
              </div>
              <Input label="Date From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <Input label="Date To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />

              {error && <p className="text-xs text-red-400">{error}</p>}

              <Button variant="primary" className="w-full" onClick={handleRun} isLoading={isRunning}>
                ▶ Run Simulation
              </Button>
            </CardBody>
          </Card>

          {/* Previous simulations */}
          <Card>
            <CardHeader><h2 className="font-semibold text-white text-sm">Previous Simulations</h2></CardHeader>
            <CardBody className="p-0 max-h-72 overflow-y-auto">
              {isLoadingSims ? (
                <div className="flex justify-center py-4"><Spinner size="sm" /></div>
              ) : simulations.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">No simulations yet</p>
              ) : (
                simulations.map((sim) => (
                  <button
                    key={sim.id}
                    onClick={() => loadSimulation(sim)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-700 hover:bg-gray-700/50 transition-colors ${selected?.id === sim.id ? 'bg-gray-700/50' : ''}`}
                  >
                    <div className="text-sm font-medium text-white truncate">{sim.name || `Sim ${sim.id.slice(0, 8)}`}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {sim.totalBets} bets · ROI: {(sim.roi * 100).toFixed(1)}%
                    </div>
                  </button>
                ))
              )}
            </CardBody>
          </Card>
        </div>

        {/* Right panel: results */}
        <div className="flex-1 min-w-0 space-y-5">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="text-5xl mb-4">🎲</div>
              <h3 className="text-lg font-semibold text-gray-300">Run a simulation</h3>
              <p className="text-gray-500 text-sm mt-2">Configure the parameters and click ▶ Run Simulation</p>
            </div>
          ) : (
            <>
              {/* Metrics */}
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-white">{selected.name || `Simulation ${selected.id.slice(0, 8)}`}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full ${selected.status === 'completed' ? 'bg-green-900/60 text-green-300' : selected.status === 'failed' ? 'bg-red-900/60 text-red-300' : 'bg-yellow-900/60 text-yellow-300'}`}>
                  {selected.status}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard label="Total Bets" value={selected.totalBets.toString()} />
                <MetricCard label="Won" value={selected.wonBets.toString()} positive />
                <MetricCard label="Lost" value={selected.lostBets.toString()} negative />
                <MetricCard label="Hit Rate" value={`${(selected.hitRate * 100).toFixed(1)}%`} />
                <MetricCard
                  label="ROI"
                  value={`${selected.roi >= 0 ? '+' : ''}${(selected.roi * 100).toFixed(1)}%`}
                  positive={selected.roi > 0}
                  negative={selected.roi < 0}
                />
                <MetricCard
                  label="Total Profit"
                  value={`${selected.totalProfit >= 0 ? '+' : ''}${selected.totalProfit.toFixed(2)}`}
                  positive={selected.totalProfit > 0}
                  negative={selected.totalProfit < 0}
                />
                <MetricCard label="Final Bankroll" value={selected.currentBankroll.toFixed(2)} />
                <MetricCard label="Max Drawdown" value={`${(selected.maxDrawdown * 100).toFixed(1)}%`} negative />
              </div>

              {/* Bankroll Evolution Chart */}
              {chartData.length > 0 && (
                <Card>
                  <CardHeader><h3 className="font-semibold text-white">Bankroll Evolution</h3></CardHeader>
                  <CardBody>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="index" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                          labelStyle={{ color: '#e5e7eb' }}
                          formatter={(value: number) => [value.toFixed(2)]}
                        />
                        <ReferenceLine y={selected.initialBankroll} stroke="#6b7280" strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="bankroll" stroke="#3b82f6" strokeWidth={2} dot={false} name="Bankroll" />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardBody>
                </Card>
              )}

              {/* Bets Table */}
              {selected.bets.length > 0 && (
                <Card>
                  <CardHeader><h3 className="font-semibold text-white">Bet-by-Bet Results</h3></CardHeader>
                  <CardBody className="p-0 max-h-80 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-800">
                        <tr className="border-b border-gray-700 text-gray-400 uppercase">
                          <th className="px-4 py-2 text-left">#</th>
                          <th className="px-4 py-2 text-left">Market</th>
                          <th className="px-4 py-2 text-left">Outcome</th>
                          <th className="px-4 py-2 text-right">Odds</th>
                          <th className="px-4 py-2 text-right">Stake</th>
                          <th className="px-4 py-2 text-right">Profit</th>
                          <th className="px-4 py-2 text-right">Bankroll</th>
                          <th className="px-4 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.bets.map((bet, i) => (
                          <tr key={bet.valueBetId} className="border-b border-gray-700 hover:bg-gray-700/30">
                            <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                            <td className="px-4 py-2 text-gray-300">{bet.market}</td>
                            <td className="px-4 py-2 text-white">{bet.outcome}</td>
                            <td className="px-4 py-2 text-right text-white">{bet.odds.toFixed(2)}</td>
                            <td className="px-4 py-2 text-right text-gray-300">{bet.stake.toFixed(2)}</td>
                            <td className={`px-4 py-2 text-right font-medium ${bet.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {bet.profit >= 0 ? '+' : ''}{bet.profit.toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-right text-white">{bet.bankrollAfter.toFixed(2)}</td>
                            <td className="px-4 py-2 text-center">
                              <StatusBadge status={bet.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardBody>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
