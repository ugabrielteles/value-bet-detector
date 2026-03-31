import { useCallback, useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts'
import { autoBetsApi, bankrollApi, matchesApi } from '../services/api'
import type {
  AutoBet,
  AutoBetStatus,
  AutoBetsAnalytics,
  Bankroll,
  Match,
  UpdateAutoBetOutcome,
} from '../types'

// ── helpers ──────────────────────────────────────────────────────────────────

const AUTO_BETS_ENQUEUE_WINDOW_SECONDS = 120
const UI_REFRESH_SECONDS = 15

function toNumberSafe(value: unknown, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function fmt(n: unknown, decimals = 2) {
  return toNumberSafe(n).toFixed(decimals)
}

function fmtPnl(n: unknown) {
  const safe = toNumberSafe(n)
  const sign = safe >= 0 ? '+' : ''
  return `${sign}${safe.toFixed(2)}`
}

function getNextEnqueueEtaSeconds(reference: number): number {
  const elapsed = Math.floor(reference / 1000) % AUTO_BETS_ENQUEUE_WINDOW_SECONDS
  return elapsed === 0 ? AUTO_BETS_ENQUEUE_WINDOW_SECONDS : AUTO_BETS_ENQUEUE_WINDOW_SECONDS - elapsed
}

function formatMoney(value: number, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency || 'BRL',
    maximumFractionDigits: 2,
  }).format(toNumberSafe(value))
}

function getAutomationNavigationMode(bet: AutoBet): 'deep-link' | 'fallback' | null {
  const logs = Array.isArray(bet.automationLog) ? bet.automationLog : []
  const joined = logs.join(' | ').toLowerCase()

  if (joined.includes('resolved event by team search') || joined.includes('team-search fallback')) {
    return 'fallback'
  }

  if (joined.includes('opened event page from provided url') || joined.includes('deep event url detected')) {
    return 'deep-link'
  }

  return null
}

const STATUS_COLORS: Record<string, string> = {
  queued: 'text-blue-400 bg-blue-900/20',
  placing: 'text-yellow-400 bg-yellow-900/20',
  placed: 'text-purple-400 bg-purple-900/20',
  won: 'text-green-400 bg-green-900/20',
  lost: 'text-red-400 bg-red-900/20',
  failed: 'text-orange-400 bg-orange-900/20',
  skipped: 'text-gray-400 bg-gray-800',
  cancelled: 'text-gray-500 bg-gray-800',
  void: 'text-gray-400 bg-gray-800',
}

type Tab = 'open' | 'history' | 'analytics' | 'settings'

// ── component ─────────────────────────────────────────────────────────────────

export default function AutoBets() {
  const [tab, setTab] = useState<Tab>('analytics')
  const [bets, setBets] = useState<AutoBet[]>([])
  const [total, setTotal] = useState(0)
  const [analytics, setAnalytics] = useState<AutoBetsAnalytics | null>(null)
  const [bankroll, setBankroll] = useState<Bankroll | null>(null)
  const [statusFilter, setStatusFilter] = useState<AutoBetStatus>('all')
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null)
  const [refreshTick, setRefreshTick] = useState<number>(() => Date.now())
  const [matchMap, setMatchMap] = useState<Record<string, Match>>({})

  // Outcome modal
  const [outcomeModal, setOutcomeModal] = useState<{ bet: AutoBet } | null>(null)
  const [outcomeForm, setOutcomeForm] = useState<{ outcome: 'won' | 'lost' | 'void'; winnings: string; betSlipId: string }>({
    outcome: 'won',
    winnings: '',
    betSlipId: '',
  })

  // Auto-bet settings (from bankroll)
  const [settingsForm, setSettingsForm] = useState({
    autoBetEnabled: false,
    autoBetProvider: '',
    autoBetMinValue: 5,
    autoBetMinClassification: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH',
    autoBetMaxDailyBets: 10,
    autoBetDryRun: true,
  })
  const [savingSettings, setSavingSettings] = useState(false)

  const selectedProviderBalance = (() => {
    if (!bankroll?.providerBalances || !settingsForm.autoBetProvider) return bankroll?.currentBankroll
    return bankroll.providerBalances[settingsForm.autoBetProvider] ?? bankroll.currentBankroll
  })()

  const loadBets = useCallback(async () => {
    setLoading(true)
    try {
      const result = await autoBetsApi.list({ status: statusFilter === 'all' ? undefined : statusFilter, page, limit: 25 })
      setBets(result.data)
      setTotal(result.total)
    } catch {
      setError('Failed to load auto-bets')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, page])

  const loadAnalytics = useCallback(async () => {
    try {
      const a = await autoBetsApi.getAnalytics()
      setAnalytics({
        totalAutoBets: toNumberSafe((a as Partial<AutoBetsAnalytics>).totalAutoBets),
        queued: toNumberSafe((a as Partial<AutoBetsAnalytics>).queued),
        placing: toNumberSafe((a as Partial<AutoBetsAnalytics>).placing),
        placed: toNumberSafe((a as Partial<AutoBetsAnalytics>).placed),
        won: toNumberSafe((a as Partial<AutoBetsAnalytics>).won),
        lost: toNumberSafe((a as Partial<AutoBetsAnalytics>).lost),
        void: toNumberSafe((a as Partial<AutoBetsAnalytics>).void),
        failed: toNumberSafe((a as Partial<AutoBetsAnalytics>).failed),
        skipped: toNumberSafe((a as Partial<AutoBetsAnalytics>).skipped),
        cancelled: toNumberSafe((a as Partial<AutoBetsAnalytics>).cancelled),
        totalStaked: toNumberSafe((a as Partial<AutoBetsAnalytics>).totalStaked),
        totalProfit: toNumberSafe((a as Partial<AutoBetsAnalytics>).totalProfit),
        avgStake: toNumberSafe((a as Partial<AutoBetsAnalytics>).avgStake),
        roi: toNumberSafe((a as Partial<AutoBetsAnalytics>).roi),
        winRate: toNumberSafe((a as Partial<AutoBetsAnalytics>).winRate),
        bankrollCurrent: toNumberSafe((a as Partial<AutoBetsAnalytics>).bankrollCurrent),
        bankrollImpact: toNumberSafe((a as Partial<AutoBetsAnalytics>).bankrollImpact),
        stopLossTriggered: Boolean((a as Partial<AutoBetsAnalytics>).stopLossTriggered),
        todaySuccessfulPlaced: toNumberSafe((a as Partial<AutoBetsAnalytics>).todaySuccessfulPlaced),
        dailySuccessfulLimit: toNumberSafe((a as Partial<AutoBetsAnalytics>).dailySuccessfulLimit, 20),
        byBookmaker: Array.isArray((a as Partial<AutoBetsAnalytics>).byBookmaker)
          ? (a as AutoBetsAnalytics).byBookmaker
          : [],
        byMarket: Array.isArray((a as Partial<AutoBetsAnalytics>).byMarket)
          ? (a as AutoBetsAnalytics).byMarket
          : [],
        dailyPnl: Array.isArray((a as Partial<AutoBetsAnalytics>).dailyPnl)
          ? (a as AutoBetsAnalytics).dailyPnl
          : [],
      })
    } catch {
      // silent
    }
  }, [])

  const loadBankroll = useCallback(async () => {
    try {
      const b = await bankrollApi.getBankroll()
      setBankroll(b)
      setSettingsForm({
        autoBetEnabled: b.autoBetEnabled ?? false,
        autoBetProvider: b.autoBetProvider ?? '',
        autoBetMinValue: b.autoBetMinValue ?? 5,
        autoBetMinClassification: b.autoBetMinClassification ?? 'MEDIUM',
        autoBetMaxDailyBets: b.autoBetMaxDailyBets ?? 10,
        autoBetDryRun: b.autoBetDryRun !== false,
      })
    } catch {
      // silent
    }
  }, [])

  const refreshAll = useCallback(() => {
    void loadBets()
    void loadAnalytics()
    setLastRefreshAt(new Date())
  }, [loadBets, loadAnalytics])

  useEffect(() => {
    void loadAnalytics()
    void loadBankroll()
  }, [loadAnalytics, loadBankroll])

  useEffect(() => {
    void loadBets()
  }, [loadBets])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRefreshTick(Date.now())
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      refreshAll()
    }, UI_REFRESH_SECONDS * 1000)

    return () => window.clearInterval(intervalId)
  }, [refreshAll])

  useEffect(() => {
    const handleImmediateRefresh = () => {
      if (document.hidden) return
      refreshAll()
    }

    window.addEventListener('focus', handleImmediateRefresh)
    document.addEventListener('visibilitychange', handleImmediateRefresh)

    return () => {
      window.removeEventListener('focus', handleImmediateRefresh)
      document.removeEventListener('visibilitychange', handleImmediateRefresh)
    }
  }, [refreshAll])

  useEffect(() => {
    const missingMatchIds = Array.from(
      new Set(
        bets
          .map((bet) => bet.matchId)
          .filter((id) => id && !matchMap[id]),
      ),
    )

    if (missingMatchIds.length === 0) return

    void Promise.allSettled(missingMatchIds.map((id) => matchesApi.getMatch(id))).then((results) => {
      const next: Record<string, Match> = {}
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          next[missingMatchIds[index]] = result.value
        }
      })

      if (Object.keys(next).length > 0) {
        setMatchMap((prev) => ({ ...prev, ...next }))
      }
    })
  }, [bets, matchMap])

  const handleExecuteAll = async () => {
    setExecuting(true)
    setError(null)
    try {
      const result = await autoBetsApi.executeAll()
      setError(null)
      alert(`Executed: ${result.executed} | Failed: ${result.failed}`)
      void loadBets()
      void loadAnalytics()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Execution failed')
    } finally {
      setExecuting(false)
    }
  }

  const handleExecute = async (id: string) => {
    try {
      await autoBetsApi.execute(id)
      void loadBets()
      void loadAnalytics()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Execution failed')
    }
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this bet?')) return
    try {
      await autoBetsApi.cancel(id)
      void loadBets()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Cancel failed')
    }
  }

  const handleOutcomeSave = async () => {
    if (!outcomeModal) return
    const payload: UpdateAutoBetOutcome = {
      outcome: outcomeForm.outcome,
      winnings: outcomeForm.winnings ? +outcomeForm.winnings : undefined,
      betSlipId: outcomeForm.betSlipId || undefined,
    }
    try {
      await autoBetsApi.updateOutcome(outcomeModal.bet.id, payload)
      setOutcomeModal(null)
      void loadBets()
      void loadAnalytics()
      void loadBankroll()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      await bankrollApi.updateBankroll({
        ...(bankroll as any),
        ...settingsForm,
        autoBetProvider: settingsForm.autoBetProvider || null,
      })
      void loadBankroll()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSavingSettings(false)
    }
  }

  // ── render helpers ────────────────────────────────────────────────────────

  const StatCard = ({ label, value, sub, color = 'text-white' }: { label: string; value: string | number; sub?: string; color?: string }) => (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )

  const tabClasses = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
      tab === t
        ? 'bg-gray-800 text-blue-400 border-b-2 border-blue-400'
        : 'text-gray-400 hover:text-white'
    }`

  // ── main render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Auto Bets</h1>
            <p className="text-gray-400 text-sm mt-1">
              Automated bet placement pipeline with bankroll-integrated tracking
            </p>
          </div>
          <div className="flex gap-3">
            {analytics?.stopLossTriggered && (
              <span className="px-3 py-1 text-sm bg-red-900/50 border border-red-700 text-red-400 rounded-full">
                Stop-Loss Active
              </span>
            )}
            {settingsForm.autoBetEnabled ? (
              <span className="px-3 py-1 text-sm bg-green-900/50 border border-green-700 text-green-400 rounded-full">
                {settingsForm.autoBetDryRun ? 'Dry-Run On' : 'Live Betting'}
              </span>
            ) : (
              <span className="px-3 py-1 text-sm bg-gray-800 border border-gray-700 text-gray-400 rounded-full">
                Auto-Bet Off
              </span>
            )}
            <button
              onClick={handleExecuteAll}
              disabled={executing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium"
            >
              {executing ? 'Running…' : 'Execute Queued'}
            </button>
            <button
              onClick={async () => {
                setExecuting(true)
                setError(null)
                try {
                  const result = await autoBetsApi.executeAll({ includeFailed: true })
                  alert(`Reprocessed: ${result.executed} | Still failed: ${result.failed}`)
                  void loadBets()
                  void loadAnalytics()
                } catch (e: unknown) {
                  setError(e instanceof Error ? e.message : 'Reprocess failed')
                } finally {
                  setExecuting(false)
                }
              }}
              disabled={executing}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg text-sm font-medium"
            >
              {executing ? 'Running…' : 'Reprocess Failed'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Top KPIs */}
        {analytics && (
          <>
            <div className="mb-4 rounded-lg border border-blue-600/30 bg-blue-900/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-blue-200">Como novas apostas entram na fila</h2>
                <div className="text-xs text-blue-300">
                  Proxima varredura do enfileiramento em <span className="font-semibold">{getNextEnqueueEtaSeconds(refreshTick)}s</span>
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-300 grid grid-cols-1 md:grid-cols-2 gap-1">
                <span>1) Auto-Bet precisa estar ligado nas configuracoes.</span>
                <span>2) A oportunidade precisa ser da casa configurada (ex.: Betano).</span>
                <span>3) Value edge e classificacao devem atender seus filtros minimos.</span>
                <span>4) Nao pode ter stop-loss acionado e nem limite diario estourado.</span>
              </div>
              <div className="mt-2 text-[11px] text-gray-400">
                A tela atualiza automaticamente a cada {UI_REFRESH_SECONDS}s {lastRefreshAt ? `| ultimo refresh: ${lastRefreshAt.toLocaleTimeString()}` : ''}
              </div>
              {analytics && (
                <div className="mt-2 text-xs text-blue-300">
                  Limite diario (sucesso): <span className="font-semibold">{analytics.todaySuccessfulPlaced}/{analytics.dailySuccessfulLimit}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
            <StatCard label="Total Placed" value={analytics.placed + analytics.won + analytics.lost + analytics.void} />
            <StatCard label="Queued" value={analytics.queued} color="text-blue-400" />
            <StatCard
              label="Win Rate"
              value={`${fmt(analytics.winRate)}%`}
              color={analytics.winRate >= 50 ? 'text-green-400' : 'text-red-400'}
            />
            <StatCard
              label="ROI"
              value={`${fmtPnl(analytics.roi)}%`}
              color={analytics.roi >= 0 ? 'text-green-400' : 'text-red-400'}
            />
            <StatCard
              label="Total P&L"
              value={fmtPnl(analytics.totalProfit)}
              sub={`Staked: ${formatMoney(analytics.totalStaked, bankroll?.currency ?? 'BRL')}`}
              color={analytics.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}
            />
            <StatCard
              label="Bankroll"
              value={formatMoney(analytics.bankrollCurrent, bankroll?.currency ?? 'BRL')}
              sub={`Impact: ${fmtPnl(analytics.bankrollImpact)}%`}
              color="text-purple-400"
            />
            </div>
          </>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-0 border-b border-gray-700">
          {(['analytics', 'open', 'history', 'settings'] as Tab[]).map((t) => (
            <button key={t} className={tabClasses(t)} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'open' && analytics && analytics.queued > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-600 rounded-full text-white">
                  {analytics.queued}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="bg-gray-800 rounded-b-lg rounded-tr-lg border border-gray-700 p-4">
          {/* ── Analytics Tab ── */}
          {tab === 'analytics' && analytics && (
            <div className="space-y-6">
              {/* Status breakdown */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {[
                  { key: 'won', label: 'Won', val: analytics.won, color: 'text-green-400' },
                  { key: 'lost', label: 'Lost', val: analytics.lost, color: 'text-red-400' },
                  { key: 'placed', label: 'Open', val: analytics.placed, color: 'text-purple-400' },
                  { key: 'failed', label: 'Failed', val: analytics.failed, color: 'text-orange-400' },
                  { key: 'skipped', label: 'Skipped', val: analytics.skipped, color: 'text-gray-400' },
                  { key: 'cancelled', label: 'Cancelled', val: analytics.cancelled, color: 'text-gray-500' },
                ].map((s) => (
                  <div key={s.key} className="bg-gray-900 rounded p-3 text-center border border-gray-700">
                    <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                    <p className="text-xs text-gray-400 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* P&L chart */}
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Cumulative P&L (90 days)</h3>
                {analytics.dailyPnl.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={analytics.dailyPnl} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                        labelStyle={{ color: '#f9fafb' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="cumulativeProfit"
                        stroke="#3b82f6"
                        dot={false}
                        strokeWidth={2}
                        name="Cumulative P&L"
                      />
                      <Line
                        type="monotone"
                        dataKey="profit"
                        stroke="#10b981"
                        dot={false}
                        strokeWidth={1.5}
                        name="Daily P&L"
                        strokeDasharray="4 2"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[220px] rounded-lg border border-dashed border-gray-700 bg-gray-900/60 flex items-center justify-center text-sm text-gray-400">
                    Sem dados de P&amp;L ainda. Execute ingestao e apostas para preencher este grafico.
                  </div>
                )}
              </div>

              {/* By bookmaker + by market */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">By Bookmaker</h3>
                  {analytics.byBookmaker.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={analytics.byBookmaker} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey="bookmaker" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                          <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                            labelStyle={{ color: '#f9fafb' }}
                          />
                          <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                          <Bar dataKey="totalBets" fill="#3b82f6" name="Bets" />
                          <Bar dataKey="won" fill="#10b981" name="Won" />
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="mt-3 space-y-1">
                        {analytics.byBookmaker.map((b) => (
                          <div key={b.bookmaker} className="flex items-center justify-between text-sm py-1 border-b border-gray-700">
                            <span className="text-gray-300 capitalize">{b.bookmaker}</span>
                            <span className="text-gray-400">{b.totalBets} bets</span>
                            <span className={b.roi >= 0 ? 'text-green-400' : 'text-red-400'}>
                              ROI {fmtPnl(b.roi)}%
                            </span>
                            <span className={b.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
                              {fmtPnl(b.totalProfit)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="h-[180px] rounded-lg border border-dashed border-gray-700 bg-gray-900/60 flex items-center justify-center text-sm text-gray-400">
                      Sem dados por casa ainda.
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">By Market</h3>
                  {analytics.byMarket.length > 0 ? (
                    <div className="space-y-2">
                      {analytics.byMarket.map((m) => (
                        <div key={m.market} className="bg-gray-900 rounded p-3 border border-gray-700">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-200">{m.market}</span>
                            <span className={`text-sm font-bold ${m.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {fmtPnl(m.roi)}% ROI
                            </span>
                          </div>
                          <div className="flex gap-4 text-xs text-gray-400">
                            <span>{m.totalBets} bets</span>
                            <span>{fmt(m.winRate)}% win</span>
                            <span className={m.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
                              P&amp;L {fmtPnl(m.totalProfit)}
                            </span>
                          </div>
                          <div className="mt-2 bg-gray-700 rounded-full h-1">
                            <div
                              className="bg-green-500 h-1 rounded-full"
                              style={{ width: `${Math.min(m.winRate, 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-[180px] rounded-lg border border-dashed border-gray-700 bg-gray-900/60 flex items-center justify-center text-sm text-gray-400">
                      Sem dados por mercado ainda.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Open Bets Tab ── */}
          {tab === 'open' && (
            <div className="space-y-3">
              {loading ? (
                <p className="text-gray-400 text-sm">Loading…</p>
              ) : bets.filter((b) => ['queued', 'placing', 'placed'].includes(b.status)).length === 0 ? (
                <p className="text-gray-400 text-sm">No open auto-bets.</p>
              ) : (
                bets
                  .filter((b) => ['queued', 'placing', 'placed'].includes(b.status))
                  .map((bet) => (
                    <BetRow
                      key={bet.id}
                      bet={bet}
                      matchLabel={matchMap[bet.matchId]
                        ? `${matchMap[bet.matchId].homeTeam.name} vs ${matchMap[bet.matchId].awayTeam.name}`
                        : undefined}
                      expandedLog={expandedLog}
                      setExpandedLog={setExpandedLog}
                      onExecute={handleExecute}
                      onCancel={handleCancel}
                      onResolve={(b) => {
                        setOutcomeModal({ bet: b })
                        setOutcomeForm({ outcome: 'won', winnings: '', betSlipId: '' })
                      }}
                    />
                  ))
              )}
            </div>
          )}

          {/* ── History Tab ── */}
          {tab === 'history' && (
            <div>
              <div className="flex gap-2 mb-4 flex-wrap">
                {(['all', 'won', 'lost', 'void', 'failed', 'skipped', 'cancelled'] as AutoBetStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setStatusFilter(s); setPage(1) }}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      statusFilter === s
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-gray-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
                {statusFilter === 'failed' && (
                  <button
                    onClick={async () => {
                      setExecuting(true)
                      setError(null)
                      try {
                        const result = await autoBetsApi.executeAll({ includeFailed: true })
                        alert(`Reprocessed: ${result.executed} | Still failed: ${result.failed}`)
                        void loadBets()
                        void loadAnalytics()
                      } catch (e: unknown) {
                        setError(e instanceof Error ? e.message : 'Reprocess failed')
                      } finally {
                        setExecuting(false)
                      }
                    }}
                    disabled={executing}
                    className="px-3 py-1 text-xs rounded-full border border-amber-700 text-amber-300 hover:text-amber-200 disabled:opacity-50"
                  >
                    Retry All Failed
                  </button>
                )}
              </div>

              {loading ? (
                <p className="text-gray-400 text-sm">Loading…</p>
              ) : bets.length === 0 ? (
                <p className="text-gray-400 text-sm">No bets found.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {bets.map((bet) => (
                      <BetRow
                        key={bet.id}
                        bet={bet}
                        matchLabel={matchMap[bet.matchId]
                          ? `${matchMap[bet.matchId].homeTeam.name} vs ${matchMap[bet.matchId].awayTeam.name}`
                          : undefined}
                        expandedLog={expandedLog}
                        setExpandedLog={setExpandedLog}
                        onExecute={handleExecute}
                        onCancel={handleCancel}
                        onResolve={(b) => {
                          setOutcomeModal({ bet: b })
                          setOutcomeForm({ outcome: 'won', winnings: '', betSlipId: '' })
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
                    <span>Showing {bets.length} of {total}</span>
                    <div className="flex gap-2">
                      <button
                        disabled={page === 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="px-3 py-1 border border-gray-700 rounded disabled:opacity-40 hover:border-gray-500"
                      >
                        Prev
                      </button>
                      <button
                        disabled={bets.length < 25}
                        onClick={() => setPage((p) => p + 1)}
                        className="px-3 py-1 border border-gray-700 rounded disabled:opacity-40 hover:border-gray-500"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Settings Tab ── */}
          {tab === 'settings' && bankroll && (
            <div className="max-w-xl space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-gray-200 mb-1">Bankroll overview</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-900 rounded p-3 border border-gray-700">
                    <p className="text-xs text-gray-400">Current</p>
                    <p className="text-lg font-bold text-white">{formatMoney(bankroll.currentBankroll, bankroll.currency)}</p>
                  </div>
                  <div className="bg-gray-900 rounded p-3 border border-gray-700">
                    <p className="text-xs text-gray-400">Provider Balance</p>
                    <p className="text-lg font-bold text-blue-300">{formatMoney(selectedProviderBalance ?? 0, bankroll.currency)}</p>
                  </div>
                  <div className="bg-gray-900 rounded p-3 border border-gray-700">
                    <p className="text-xs text-gray-400">ROI</p>
                    <p className={`text-lg font-bold ${bankroll.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {fmtPnl(bankroll.roi)}%
                    </p>
                  </div>
                  <div className="bg-gray-900 rounded p-3 border border-gray-700">
                    <p className="text-xs text-gray-400">Stop-loss</p>
                    <p className={`text-lg font-bold ${bankroll.isStopped ? 'text-red-400' : 'text-green-400'}`}>
                      {bankroll.isStopped ? 'TRIGGERED' : 'OK'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 bg-gray-900 rounded-lg border border-gray-700 p-4">
                <h3 className="text-sm font-semibold text-gray-200">Auto-Bet Configuration</h3>

                {/* Master switch */}
                <label className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Enable Auto-Bet</span>
                  <button
                    onClick={() => setSettingsForm((f) => ({ ...f, autoBetEnabled: !f.autoBetEnabled }))}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      settingsForm.autoBetEnabled ? 'bg-blue-600' : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        settingsForm.autoBetEnabled ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>

                {/* Dry-run toggle */}
                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-300">Dry-Run Mode</span>
                    <p className="text-xs text-gray-500">Simulate bets without placing real money</p>
                  </div>
                  <button
                    onClick={() => setSettingsForm((f) => ({ ...f, autoBetDryRun: !f.autoBetDryRun }))}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      settingsForm.autoBetDryRun ? 'bg-yellow-600' : 'bg-red-700'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        settingsForm.autoBetDryRun ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>

                {!settingsForm.autoBetDryRun && (
                  <div className="p-3 bg-red-900/30 border border-red-700 rounded text-xs text-red-300">
                    ⚠ Real betting is enabled. Bets will use actual funds. Also requires{' '}
                    <code>ALLOW_REAL_BETTING=true</code> on the server.
                  </div>
                )}

                {/* Provider */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Bookmaker Provider</label>
                  <select
                    value={settingsForm.autoBetProvider}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, autoBetProvider: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 text-gray-200 rounded px-3 py-2 text-sm"
                  >
                    <option value="">— Select provider —</option>
                    <option value="betano">Betano</option>
                    <option value="bet365">Bet365</option>
                    <option value="betfair">Betfair</option>
                    <option value="bwin">Bwin</option>
                    <option value="unibet">Unibet</option>
                  </select>
                </div>

                {/* Min value edge */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Minimum Value Edge (%) — only auto-bet when edge ≥ this
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={settingsForm.autoBetMinValue}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, autoBetMinValue: +e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 text-gray-200 rounded px-3 py-2 text-sm"
                  />
                </div>

                {/* Min classification */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Minimum Classification</label>
                  <div className="flex gap-2">
                    {(['LOW', 'MEDIUM', 'HIGH'] as const).map((c) => (
                      <button
                        key={c}
                        onClick={() => setSettingsForm((f) => ({ ...f, autoBetMinClassification: c }))}
                        className={`flex-1 py-1.5 text-xs rounded border transition-colors ${
                          settingsForm.autoBetMinClassification === c
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-gray-700 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Max daily bets */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Max Auto-Bets per Day</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={settingsForm.autoBetMaxDailyBets}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, autoBetMaxDailyBets: +e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 text-gray-200 rounded px-3 py-2 text-sm"
                  />
                </div>

                <button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-sm font-medium"
                >
                  {savingSettings ? 'Saving…' : 'Save Settings'}
                </button>
              </div>

              {/* Stop-loss reminder */}
              <div className="bg-gray-900 rounded border border-gray-700 p-4 text-xs text-gray-400 space-y-1">
                <p className="font-semibold text-gray-300">Stop-Loss is configured in Bankroll Settings</p>
                <p>
                  Current stop-loss: {bankroll.stopLossEnabled
                    ? `${bankroll.stopLossPercentage}% drawdown`
                    : 'disabled'}
                </p>
                <p>Stake strategy: {bankroll.strategy} | Kelly fraction: {bankroll.kellyFraction}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Outcome Modal */}
      {outcomeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md">
            {getAutomationNavigationMode(outcomeModal.bet) && (
              <div className="mb-2">
                {getAutomationNavigationMode(outcomeModal.bet) === 'deep-link' ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-700/70 bg-emerald-900/30 text-emerald-300">
                    Modo de navegacao: Deep link
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-700/70 bg-amber-900/30 text-amber-300">
                    Modo de navegacao: Fallback por times
                  </span>
                )}
              </div>
            )}
            <h2 className="text-lg font-bold text-white mb-1">Update Outcome</h2>
            <p className="text-xs text-gray-400 mb-4">
              {outcomeModal.bet.market} · {outcomeModal.bet.outcome} @ {outcomeModal.bet.bookmakerOdds}
              {' | '}Staked: {fmt(outcomeModal.bet.stakeAmount)}
            </p>

            <div className="space-y-4">
              <div className="flex gap-2">
                {(['won', 'lost', 'void'] as const).map((o) => (
                  <button
                    key={o}
                    onClick={() => setOutcomeForm((f) => ({ ...f, outcome: o }))}
                    className={`flex-1 py-2 rounded text-sm font-medium border transition-colors ${
                      outcomeForm.outcome === o
                        ? o === 'won'
                          ? 'bg-green-700 border-green-600 text-white'
                          : o === 'lost'
                          ? 'bg-red-700 border-red-600 text-white'
                          : 'bg-gray-700 border-gray-600 text-white'
                        : 'border-gray-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    {o.charAt(0).toUpperCase() + o.slice(1)}
                  </button>
                ))}
              </div>

              {outcomeForm.outcome === 'won' && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Gross winnings (leave empty to auto-calculate from odds)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder={`Auto: ${fmt(outcomeModal.bet.stakeAmount * (outcomeModal.bet.bookmakerOdds - 1))}`}
                    value={outcomeForm.winnings}
                    onChange={(e) => setOutcomeForm((f) => ({ ...f, winnings: e.target.value }))}
                    className="w-full bg-gray-900 border border-gray-700 text-gray-200 rounded px-3 py-2 text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-400 mb-1">Bet Slip ID (optional)</label>
                <input
                  type="text"
                  placeholder="From bookmaker confirmation"
                  value={outcomeForm.betSlipId}
                  onChange={(e) => setOutcomeForm((f) => ({ ...f, betSlipId: e.target.value }))}
                  className="w-full bg-gray-900 border border-gray-700 text-gray-200 rounded px-3 py-2 text-sm"
                />
              </div>

              <div className="p-3 bg-gray-900 rounded text-xs text-gray-400">
                {outcomeForm.outcome === 'won' && (
                  <span className="text-green-400">
                    +{fmt(
                      outcomeForm.winnings
                        ? +outcomeForm.winnings
                        : outcomeModal.bet.stakeAmount * (outcomeModal.bet.bookmakerOdds - 1),
                    )}{' '}
                    will be added to bankroll
                  </span>
                )}
                {outcomeForm.outcome === 'lost' && (
                  <span className="text-red-400">
                    -{fmt(outcomeModal.bet.stakeAmount)} will be deducted from bankroll
                  </span>
                )}
                {outcomeForm.outcome === 'void' && (
                  <span className="text-gray-300">No bankroll change (stake returned)</span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setOutcomeModal(null)}
                  className="flex-1 py-2 border border-gray-700 rounded text-sm text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleOutcomeSave}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── BetRow component ──────────────────────────────────────────────────────────

function BetRow({
  bet,
  matchLabel,
  expandedLog,
  setExpandedLog,
  onExecute,
  onCancel,
  onResolve,
}: {
  bet: AutoBet
  matchLabel?: string
  expandedLog: string | null
  setExpandedLog: (id: string | null) => void
  onExecute: (id: string) => void
  onCancel: (id: string) => void
  onResolve: (bet: AutoBet) => void
}) {
  const statusCls = STATUS_COLORS[bet.status] ?? 'text-gray-400 bg-gray-800'
  const navMode = getAutomationNavigationMode(bet)

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
      <div className="flex items-start gap-3">
        {/* Status badge */}
        <span className={`mt-0.5 px-2 py-0.5 text-xs font-medium rounded-full shrink-0 ${statusCls}`}>
          {bet.status}
        </span>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-400 mb-1">
            {matchLabel ?? `Match ${bet.matchId.slice(0, 8)}`}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white capitalize">{bet.bookmaker}</span>
            <span className="text-gray-500">·</span>
            <span className="text-sm text-gray-300">{bet.market}</span>
            <span className="text-gray-500">·</span>
            <span className="text-sm text-gray-300">{bet.outcome}</span>
            <span className="text-gray-500">@</span>
            <span className="text-sm font-bold text-yellow-400">{bet.bookmakerOdds}</span>
            {navMode === 'deep-link' && (
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-700/70 bg-emerald-900/30 text-emerald-300">
                Deep link
              </span>
            )}
            {navMode === 'fallback' && (
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-700/70 bg-amber-900/30 text-amber-300">
                Fallback por times
              </span>
            )}
          </div>
          <div className="flex gap-4 mt-1 text-xs text-gray-400 flex-wrap">
            <span>Stake: <span className="text-white">{fmt(bet.stakeAmount)}</span></span>
            <span>Edge: <span className="text-blue-400">{fmt(toNumberSafe(bet.valueEdge) * 100, 1)}%</span></span>
            <span>Strategy: {bet.stakeStrategy}</span>
            {bet.actualProfit !== undefined && (
              <span className={bet.actualProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
                P&L: {fmtPnl(bet.actualProfit)}
              </span>
            )}
            {bet.betSlipId && <span>Slip: {bet.betSlipId}</span>}
          </div>
          {bet.automationError && (
            <p className="text-xs text-red-400 mt-1">{bet.automationError}</p>
          )}
          {!bet.bookmakerUrl && (
            <p className="text-xs text-amber-400 mt-1">
              Falta link direto do evento. Para Betano, o sistema tentara localizar a partida pelos times automaticamente.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => setExpandedLog(expandedLog === bet.id ? null : bet.id)}
            className="px-2 py-1 text-xs border border-gray-700 text-gray-400 hover:text-white rounded"
          >
            Log
          </button>
          {bet.status === 'queued' && (
            <>
              <button
                onClick={() => onExecute(bet.id)}
                className="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded"
              >
                Run
              </button>
              <button
                onClick={() => onCancel(bet.id)}
                className="px-2 py-1 text-xs border border-red-800 text-red-400 hover:text-red-300 rounded"
              >
                Cancel
              </button>
            </>
          )}
          {['placed', 'queued'].includes(bet.status) && (
            <button
              onClick={() => onResolve(bet)}
              className="px-2 py-1 text-xs bg-green-800 hover:bg-green-700 text-white rounded"
            >
              Resolve
            </button>
          )}
          {bet.bookmakerUrl && (
            <a
              href={bet.bookmakerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1 text-xs border border-gray-700 text-gray-400 hover:text-white rounded"
            >
              ↗
            </a>
          )}
        </div>
      </div>

      {/* Automation log */}
      {expandedLog === bet.id && bet.automationLog.length > 0 && (
        <div className="mt-3 bg-black/40 rounded p-2 text-xs font-mono text-gray-400 space-y-0.5">
          {navMode && (
            <div className="mb-2">
              {navMode === 'deep-link' ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-700/70 bg-emerald-900/30 text-emerald-300">
                  Modo de navegacao: Deep link
                </span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-700/70 bg-amber-900/30 text-amber-300">
                  Modo de navegacao: Fallback por times
                </span>
              )}
            </div>
          )}
          {bet.automationLog.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  )
}
