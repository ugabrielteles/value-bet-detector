import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
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
import { useI18n } from '../hooks/useI18n'

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

function toSafeNumber(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : 0
}

function formatFixed(value: unknown, digits = 2): string {
  return toSafeNumber(value).toFixed(digits)
}

export default function Simulator() {
  const SIMS_PAGE_SIZE_OPTIONS = [20, 50, 100] as const
  const BETS_PAGE_SIZE_OPTIONS = [50, 100, 200] as const
  const [simulations, setSimulations] = useState<Simulation[]>([])
  const [simsPage, setSimsPage] = useState(1)
  const [simsTotal, setSimsTotal] = useState(0)
  const [simsPageSize, setSimsPageSize] = useState<number>(20)
  const [selected, setSelected] = useState<Simulation | null>(null)
  const [simulationBets, setSimulationBets] = useState<Simulation['bets']>([])
  const [betsTotal, setBetsTotal] = useState(0)
  const [betsPage, setBetsPage] = useState(1)
  const [betsPageSize, setBetsPageSize] = useState<number>(100)
  const [isLoadingBets, setIsLoadingBets] = useState(false)
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
  const [minValue, setMinValue] = useState(0)
  const [onlyHighValue, setOnlyHighValue] = useState(false)
  const [projectPending, setProjectPending] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const { dict } = useI18n()
  const activeSimulationRef = useRef<string | null>(null)
  const betsCacheRef = useRef(new Map<string, { total: number; pages: Map<number, Simulation['bets']> }>())
  const simulationSignatureRef = useRef(new Map<string, string>())
  const betsInFlightRef = useRef(new Map<string, Promise<{ bets: Simulation['bets']; total: number; page: number; limit: number }>>())

  const getPendingCount = (sim: Simulation) => {
    if (sim.bets.length > 0) return sim.bets.filter((bet) => bet.status === 'pending').length
    return sim.pendingBets ?? 0
  }

  const totalPages = Math.max(1, Math.ceil(simsTotal / simsPageSize))
  const betsTotalPages = Math.max(1, Math.ceil((betsTotal || 0) / betsPageSize))

  const loadSimulationsPage = async (page: number) => {
    setIsLoadingSims(true)
    try {
      const res = await simulatorApi.getSimulations({ page, limit: simsPageSize })
      setSimulations(res.data)
      setSimsTotal(res.total)
      setSimsPage(res.page)
    } catch {
      // noop
    } finally {
      setIsLoadingSims(false)
    }
  }

  useEffect(() => {
    void loadSimulationsPage(1)
  }, [simsPageSize])

  const buildSimulationSignature = (sim: Simulation) => {
    return [
      sim.id,
      sim.status,
      sim.totalBets,
      sim.wonBets,
      sim.lostBets,
      sim.pendingBets ?? 0,
      sim.totalProfit,
      sim.currentBankroll,
    ].join('|')
  }

  const clearSimulationCache = (simulationId: string) => {
    const prefix = `${simulationId}::`
    for (const key of betsCacheRef.current.keys()) {
      if (key.startsWith(prefix)) {
        betsCacheRef.current.delete(key)
      }
    }
    for (const key of betsInFlightRef.current.keys()) {
      if (key.startsWith(prefix)) {
        betsInFlightRef.current.delete(key)
      }
    }
  }

  const getBetsCacheKey = (simulationId: string, limit: number) => `${simulationId}::${limit}`

  const readCachedBetsPage = (simulationId: string, page: number, limit: number) => {
    const cache = betsCacheRef.current.get(getBetsCacheKey(simulationId, limit))
    if (!cache) return null
    const bets = cache.pages.get(page)
    if (!bets) return null
    return { bets, total: cache.total }
  }

  const writeCachedBetsPage = (
    simulationId: string,
    page: number,
    limit: number,
    total: number,
    bets: Simulation['bets'],
  ) => {
    const key = getBetsCacheKey(simulationId, limit)
    const existing = betsCacheRef.current.get(key) ?? { total, pages: new Map<number, Simulation['bets']>() }
    existing.total = total
    existing.pages.set(page, bets)
    betsCacheRef.current.set(key, existing)
  }

  const fetchBetsPage = async (simulationId: string, page: number, limit: number) => {
    const requestKey = `${simulationId}::${page}::${limit}`
    const existing = betsInFlightRef.current.get(requestKey)
    if (existing) return existing

    const promise = simulatorApi
      .getSimulationBets(simulationId, { page, limit })
      .then((res) => {
        writeCachedBetsPage(simulationId, res.page, res.limit, res.total, res.bets)
        return res
      })
      .finally(() => {
        betsInFlightRef.current.delete(requestKey)
      })

    betsInFlightRef.current.set(requestKey, promise)
    return promise
  }

  const prefetchAdjacentBetsPages = (simulationId: string, page: number, total: number, limit: number) => {
    const totalPagesForLimit = Math.max(1, Math.ceil(total / limit))
    const candidates = [page - 1, page + 1].filter((candidate) => candidate >= 1 && candidate <= totalPagesForLimit)

    for (const candidate of candidates) {
      if (readCachedBetsPage(simulationId, candidate, limit)) continue
      void fetchBetsPage(simulationId, candidate, limit).catch(() => {
        // noop
      })
    }
  }

  const loadSimulationBetsPage = async (simulationId: string, page: number, limit = betsPageSize) => {
    setIsLoadingBets(true)
    try {
      const cached = readCachedBetsPage(simulationId, page, limit)
      if (cached) {
        if (activeSimulationRef.current === simulationId) {
          setSimulationBets(cached.bets)
          setBetsTotal(cached.total)
          setBetsPage(page)
        }
        prefetchAdjacentBetsPages(simulationId, page, cached.total, limit)
        return
      }

      const res = await fetchBetsPage(simulationId, page, limit)
      if (activeSimulationRef.current !== simulationId) return

      setSimulationBets(res.bets)
      setBetsTotal(res.total)
      setBetsPage(res.page)
      prefetchAdjacentBetsPages(simulationId, res.page, res.total, limit)
    } catch {
      if (activeSimulationRef.current === simulationId) {
        setSimulationBets([])
      }
    } finally {
      if (activeSimulationRef.current === simulationId) {
        setIsLoadingBets(false)
      }
    }
  }

  const loadSimulation = async (sim: Simulation) => {
    activeSimulationRef.current = sim.id
    setSelected(sim)
    setBetsPage(1)
    setSimulationBets([])
    setBetsTotal(sim.totalBets ?? 0)
    void loadSimulationBetsPage(sim.id, 1, betsPageSize)
    try {
      const [summarySimulation, chart] = await Promise.all([
        simulatorApi.getSimulationSummary(sim.id),
        simulatorApi.getSimulationChart(sim.id),
      ])

      const nextSignature = buildSimulationSignature(summarySimulation)
      const previousSignature = simulationSignatureRef.current.get(sim.id)
      if (previousSignature && previousSignature !== nextSignature) {
        clearSimulationCache(sim.id)
        if (activeSimulationRef.current === sim.id) {
          setSimulationBets([])
          setBetsPage(1)
          void loadSimulationBetsPage(sim.id, 1, betsPageSize)
        }
      }
      simulationSignatureRef.current.set(sim.id, nextSignature)

      setSelected(summarySimulation)
      setBetsTotal(summarySimulation.totalBets ?? 0)
      setChartData(chart)
    } catch {
      setChartData([])
    }
  }

  const handleRun = async () => {
    setIsRunning(true)
    setError(null)
    const normalizedName = name.trim() || `Simulation ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
    const params: RunSimulationParams = {
      name: normalizedName,
      initialBankroll,
      strategy,
      flatStakeAmount: strategy === 'flat' ? flatStake : undefined,
      percentageStake: strategy === 'percentage' ? percentageStake : undefined,
      kellyFraction: strategy === 'kelly' ? kellyFraction : undefined,
      minOdds,
      maxOdds,
      minValue: minValue / 100,
      onlyHighValue,
      projectPending,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }
    try {
      const sim = await simulatorApi.runSimulation(params)
      await loadSimulationsPage(1)
      await loadSimulation(sim)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const responseMessage = err.response?.data && typeof err.response.data === 'object'
          ? (err.response.data as { message?: string | string[] }).message
          : undefined
        if (Array.isArray(responseMessage) && responseMessage.length > 0) {
          setError(responseMessage[0])
        } else if (typeof responseMessage === 'string' && responseMessage.trim()) {
          setError(responseMessage)
        } else {
          setError(dict.simulator.simulationFailed)
        }
      } else {
        setError(err instanceof Error ? err.message : dict.simulator.simulationFailed)
      }
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">{dict.simulator.title}</h1>
        <p className="text-gray-400 text-sm mt-1">{dict.simulator.subtitle}</p>
      </div>

      <div className="flex gap-6">
        {/* Left panel: config + previous sims */}
        <div className="w-80 shrink-0 space-y-4">
          {/* Config */}
          <Card>
            <CardHeader><h2 className="font-semibold text-white text-sm">{dict.simulator.configuration}</h2></CardHeader>
            <CardBody className="space-y-3">
              <Input label={dict.simulator.name} placeholder={dict.simulator.mySimulation} value={name} onChange={(e) => setName(e.target.value)} />
              <Input
                label={dict.simulator.initialBankroll}
                type="number" min="100"
                value={initialBankroll}
                onChange={(e) => setInitialBankroll(parseFloat(e.target.value) || 0)}
              />
              <Select label={dict.simulator.strategy} value={strategy} onChange={(e) => setStrategy(e.target.value as SimulationStrategy)}>
                <option value="flat">{dict.simulator.flatStake}</option>
                <option value="kelly">{dict.simulator.kellyCriterion}</option>
                <option value="percentage">{dict.simulator.percentage}</option>
              </Select>
              {strategy === 'flat' && (
                <Input label={dict.simulator.flatStake} type="number" min="1" value={flatStake} onChange={(e) => setFlatStake(parseFloat(e.target.value) || 0)} />
              )}
              {strategy === 'percentage' && (
                <Input label={dict.simulator.stakePct} type="number" min="0.1" max="100" step="0.5" value={percentageStake} onChange={(e) => setPercentageStake(parseFloat(e.target.value) || 0)} />
              )}
              {strategy === 'kelly' && (
                <Input label={dict.simulator.kellyFraction} type="number" min="0.05" max="1" step="0.05" value={kellyFraction} onChange={(e) => setKellyFraction(parseFloat(e.target.value) || 0)} />
              )}
              <div className="grid grid-cols-2 gap-2">
                <Input label={dict.simulator.minOdds} type="number" step="0.1" min="1" value={minOdds} onChange={(e) => setMinOdds(parseFloat(e.target.value) || 0)} />
                <Input label={dict.simulator.maxOdds} type="number" step="0.5" value={maxOdds} onChange={(e) => setMaxOdds(parseFloat(e.target.value) || 0)} />
              </div>
              <Input label={dict.simulator.minValuePct} type="number" min="0" step="1" value={minValue} onChange={(e) => setMinValue(parseFloat(e.target.value) || 0)} />
              <div className="flex items-center gap-2">
                <input type="checkbox" id="highOnly" checked={onlyHighValue} onChange={(e) => setOnlyHighValue(e.target.checked)} className="w-4 h-4 accent-blue-500" />
                <label htmlFor="highOnly" className="text-sm text-gray-300">{dict.simulator.highValueOnly}</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="projectPending"
                  checked={projectPending}
                  onChange={(e) => setProjectPending(e.target.checked)}
                  className="w-4 h-4 accent-blue-500"
                />
                <label htmlFor="projectPending" className="text-sm text-gray-300">Projetar pendentes/ao vivo (valor esperado)</label>
              </div>
              <Input label={dict.simulator.dateFrom} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <Input label={dict.simulator.dateTo} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />

              {error && <p className="text-xs text-red-400">{error}</p>}

              <Button variant="primary" className="w-full" onClick={handleRun} isLoading={isRunning}>
                ▶ {dict.simulator.runSimulation}
              </Button>
            </CardBody>
          </Card>

          {/* Previous simulations */}
          <Card>
            <CardHeader><h2 className="font-semibold text-white text-sm">{dict.simulator.previousSimulations}</h2></CardHeader>
            <CardBody className="p-0">
              {isLoadingSims ? (
                <div className="flex justify-center py-4"><Spinner size="sm" /></div>
              ) : simulations.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">{dict.simulator.noSimulationsYet}</p>
              ) : (
                <>
                  <div className="max-h-72 overflow-y-auto">
                    {simulations.map((sim) => (
                      <button
                        key={sim.id}
                        onClick={() => loadSimulation(sim)}
                        className={`w-full text-left px-4 py-3 border-b border-gray-700 hover:bg-gray-700/50 transition-colors ${selected?.id === sim.id ? 'bg-gray-700/50' : ''}`}
                      >
                        <div className="text-sm font-medium text-white truncate">{sim.name || `Sim ${sim.id.slice(0, 8)}`}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {sim.totalBets} {dict.simulator.betsShort}
                          {' · '}
                          {dict.simulator.won}: {sim.wonBets}
                          {' · '}
                          {dict.simulator.lost}: {sim.lostBets}
                          {' · '}
                          {dict.simulator.pending}: {getPendingCount(sim)}
                          {' · '}
                          ROI: {(sim.roi * 100).toFixed(1)}%
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 border-t border-gray-700 bg-gray-800/60">
                    <div className="flex items-center gap-2">
                      <label htmlFor="sim-page-size" className="text-xs text-gray-400">por pagina</label>
                      <select
                        id="sim-page-size"
                        value={simsPageSize}
                        onChange={(e) => setSimsPageSize(Number(e.target.value) || 20)}
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                      >
                        {SIMS_PAGE_SIZE_OPTIONS.map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadSimulationsPage(simsPage - 1)}
                      disabled={simsPage <= 1 || isLoadingSims}
                      className="px-2.5 py-1 text-xs rounded bg-gray-700 text-gray-200 disabled:opacity-40"
                    >
                      Anterior
                    </button>
                    <span className="text-xs text-gray-400 text-center">
                      Pagina {simsPage} de {totalPages} ({simsTotal})
                    </span>
                    <button
                      type="button"
                      onClick={() => void loadSimulationsPage(simsPage + 1)}
                      disabled={simsPage >= totalPages || isLoadingSims}
                      className="px-2.5 py-1 text-xs rounded bg-gray-700 text-gray-200 disabled:opacity-40"
                    >
                      Proxima
                    </button>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Right panel: results */}
        <div className="flex-1 min-w-0 space-y-5">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="text-5xl mb-4">🎲</div>
              <h3 className="text-lg font-semibold text-gray-300">{dict.simulator.runPromptTitle}</h3>
              <p className="text-gray-500 text-sm mt-2">{dict.simulator.runPromptHint}</p>
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
                <MetricCard label={dict.simulator.totalBets} value={selected.totalBets.toString()} />
                <MetricCard label={dict.simulator.won} value={selected.wonBets.toString()} positive />
                <MetricCard label={dict.simulator.lost} value={selected.lostBets.toString()} negative />
                <MetricCard label={dict.simulator.pending} value={getPendingCount(selected).toString()} />
                <MetricCard label={dict.simulator.hitRate} value={`${(selected.hitRate * 100).toFixed(1)}%`} />
                <MetricCard
                  label={dict.simulator.roi}
                  value={`${selected.roi >= 0 ? '+' : ''}${(selected.roi * 100).toFixed(1)}%`}
                  positive={selected.roi > 0}
                  negative={selected.roi < 0}
                />
                <MetricCard
                  label={dict.simulator.totalProfit}
                  value={`${selected.totalProfit >= 0 ? '+' : ''}${selected.totalProfit.toFixed(2)}`}
                  positive={selected.totalProfit > 0}
                  negative={selected.totalProfit < 0}
                />
                <MetricCard label={dict.simulator.finalBankroll} value={selected.currentBankroll.toFixed(2)} />
                <MetricCard label={dict.simulator.maxDrawdown} value={`${(selected.maxDrawdown * 100).toFixed(1)}%`} negative />
              </div>

              {/* Bankroll Evolution Chart */}
              {chartData.length > 0 && (
                <Card>
                  <CardHeader><h3 className="font-semibold text-white">{dict.simulator.bankrollEvolution}</h3></CardHeader>
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
              {betsTotal > 0 && (
                <Card>
                  <CardHeader><h3 className="font-semibold text-white">{dict.simulator.betByBetResults}</h3></CardHeader>
                  <CardBody className="p-0 max-h-80 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-800">
                        <tr className="border-b border-gray-700 text-gray-400 uppercase">
                          <th className="px-4 py-2 text-left">#</th>
                          <th className="px-4 py-2 text-left">{dict.simulator.market}</th>
                          <th className="px-4 py-2 text-left">{dict.simulator.outcome}</th>
                          <th className="px-4 py-2 text-right">{dict.simulator.odds}</th>
                          <th className="px-4 py-2 text-right">{dict.simulator.stake}</th>
                          <th className="px-4 py-2 text-right">{dict.simulator.profit}</th>
                          <th className="px-4 py-2 text-right">{dict.simulator.bankroll}</th>
                          <th className="px-4 py-2 text-center">{dict.simulator.status}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {simulationBets.map((bet, i) => (
                          <tr key={`${bet.valueBetId || bet.matchId || 'bet'}-${i}`} className="border-b border-gray-700 hover:bg-gray-700/30">
                            <td className="px-4 py-2 text-gray-400">{(betsPage - 1) * betsPageSize + i + 1}</td>
                            <td className="px-4 py-2 text-gray-300">{bet.market || '-'}</td>
                            <td className="px-4 py-2 text-white">{bet.outcome}</td>
                            <td className="px-4 py-2 text-right text-white">{formatFixed(bet.odds)}</td>
                            <td className="px-4 py-2 text-right text-gray-300">{formatFixed(bet.stake)}</td>
                            <td className={`px-4 py-2 text-right font-medium ${toSafeNumber(bet.profit) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {toSafeNumber(bet.profit) >= 0 ? '+' : ''}{formatFixed(bet.profit)}
                            </td>
                            <td className="px-4 py-2 text-right text-white">{formatFixed(bet.bankrollAfter)}</td>
                            <td className="px-4 py-2 text-center">
                              <StatusBadge status={bet.status} />
                            </td>
                          </tr>
                        ))}
                        {!isLoadingBets && simulationBets.length === 0 && (
                          <tr>
                            <td className="px-4 py-3 text-gray-400" colSpan={8}>Sem apostas nesta pagina</td>
                          </tr>
                        )}
                        {isLoadingBets && (
                          <tr>
                            <td className="px-4 py-3 text-gray-400" colSpan={8}>Carregando apostas...</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </CardBody>
                  <div className="flex items-center justify-between px-3 py-2 border-t border-gray-700 bg-gray-800/60">
                    <div className="flex items-center gap-2">
                      <label htmlFor="bets-page-size" className="text-xs text-gray-400">linhas</label>
                      <select
                        id="bets-page-size"
                        value={betsPageSize}
                        onChange={(e) => {
                          const next = Number(e.target.value) || 100
                          setBetsPageSize(next)
                          setBetsPage(1)
                          if (selected) {
                            void loadSimulationBetsPage(selected.id, 1, next)
                          }
                        }}
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                      >
                        {BETS_PAGE_SIZE_OPTIONS.map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (selected) void loadSimulationBetsPage(selected.id, Math.max(1, betsPage - 1), betsPageSize)
                      }}
                      disabled={betsPage <= 1 || isLoadingBets}
                      className="px-2.5 py-1 text-xs rounded bg-gray-700 text-gray-200 disabled:opacity-40"
                    >
                      Anterior
                    </button>
                    <span className="text-xs text-gray-400 text-center">
                      Pagina {betsPage} de {betsTotalPages} ({betsTotal})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (selected) void loadSimulationBetsPage(selected.id, Math.min(betsTotalPages, betsPage + 1), betsPageSize)
                      }}
                      disabled={betsPage >= betsTotalPages || isLoadingBets}
                      className="px-2.5 py-1 text-xs rounded bg-gray-700 text-gray-200 disabled:opacity-40"
                    >
                      Proxima
                    </button>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
