import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import type {
  ValueCategory,
  LoginCredentials,
  RegisterData,
  User,
  AuthTokens,
  Match,
  MatchStats,
  OddsEntry,
  OddsHistory,
  SteamAlert,
  PredictionResult,
  MatchPredictionInsights,
  TodayOpportunitiesFilters,
  PersistedPredictionOpportunity,
  LiveOpportunitiesFilters,
  OpportunityMarketStats,
  RecalculatePredictionsResult,
  ValueBet,
  ValueBetFilters,
  PaginatedResponse,
  Bankroll,
  UpdateBankrollData,
  StakeRecommendation,
  AnalyticsSummary,
  DailyPerformance,
  PerformanceByCategory,
  PerformanceByMarket,
  RunSimulationParams,
  Simulation,
  SimulationChartPoint,
  BetStatus,
  IngestionLog,
  IngestionLogFilters,
  RunIngestionParams,
  IngestionSummary,
  BookmakerProvider,
  BookmakerCredentialsSafeView,
  UpsertBookmakerCredentialsData,
  AutomationProviderStatus,
  RunBookmakerAutomationParams,
  AutomationRunResult,
  AutoBet,
  AutoBetStatus,
  AutoBetsAnalytics,
  UpdateAutoBetOutcome,
} from '../types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

type BackendValueBet = {
  id: string
  matchId: string
  market: string
  outcome: string
  bookmaker: string
  bookmakerUrl?: string
  bookmakerOdds: number
  modelProbability: number
  impliedProbability: number
  value?: number
  valueScore?: number
  classification?: ValueCategory
  valueCategory?: ValueCategory
  status: BetStatus
  detectedAt: string
  resolvedAt?: string
}

type BackendSimulation = Partial<Simulation> & {
  id: string
  userId: string
  bets?: Array<Record<string, unknown>>
}

type BackendBankroll = Partial<Bankroll> & {
  id?: string
  userId?: string
}

type BackendOddsHistoryRow = {
  id?: string
  matchId: string
  bookmaker: string
  market?: string
  homeOdds?: number
  drawOdds?: number
  awayOdds?: number
  timestamp: string | Date
}

type BackendOddsHistorySeries = {
  matchId: string
  bookmaker: string
  market: string
  outcome: string
  entries: Array<{ odds: number; timestamp: string }>
}

type BackendPrediction = {
  id: string
  matchId: string
  homeProbability?: number
  drawProbability?: number
  awayProbability?: number
  confidence?: number
  createdAt?: string
  predictions?: PredictionResult['predictions']
}

function normalizeValueBet(bet: BackendValueBet): ValueBet {
  const valueScore = bet.valueScore ?? bet.value ?? 0
  const valueCategory = bet.valueCategory ?? bet.classification ?? ('LOW' as ValueCategory)

  return {
    ...bet,
    market: bet.market as ValueBet['market'],
    valueScore,
    valueCategory,
  }
}

function normalizePrediction(prediction: BackendPrediction): PredictionResult {
  if (Array.isArray(prediction.predictions)) {
    return {
      id: prediction.id,
      matchId: prediction.matchId,
      modelVersion: 'ensemble-v1',
      predictions: prediction.predictions,
      createdAt: prediction.createdAt ?? new Date().toISOString(),
    }
  }

  const confidence = prediction.confidence ?? 0.5
  return {
    id: prediction.id,
    matchId: prediction.matchId,
    modelVersion: 'ensemble-v1',
    predictions: [
      {
        outcome: 'Home Win',
        probability: prediction.homeProbability ?? 0,
        confidence,
      },
      {
        outcome: 'Draw',
        probability: prediction.drawProbability ?? 0,
        confidence,
      },
      {
        outcome: 'Away Win',
        probability: prediction.awayProbability ?? 0,
        confidence,
      },
    ],
    createdAt: prediction.createdAt ?? new Date().toISOString(),
  }
}

function normalizeSimulation(sim: BackendSimulation): Simulation {
  const toNumber = (value: unknown, fallback = 0): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  const asRecord = (value: unknown): Record<string, unknown> => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
    return {}
  }

  const pickFirst = (sources: Array<Record<string, unknown>>, keys: string[]): unknown => {
    for (const source of sources) {
      for (const key of keys) {
        if (source[key] !== undefined && source[key] !== null) return source[key]
      }
    }
    return undefined
  }

  const normalizeStatus = (value: unknown): Simulation['bets'][number]['status'] => {
    const raw = String(value ?? '').trim().toLowerCase()
    if (raw === 'won' || raw === 'resolved_won' || raw === 'win') return 'won'
    if (raw === 'lost' || raw === 'resolved_lost' || raw === 'loss') return 'lost'
    if (raw === 'void' || raw === 'cancelled' || raw === 'canceled') return 'void'
    return 'pending'
  }

  const normalizeBet = (rawBet: unknown): Simulation['bets'][number] => {
    // Legacy rows can be stored as ids only; keep id and default the rest.
    if (typeof rawBet === 'string' || typeof rawBet === 'number') {
      return {
        valueBetId: String(rawBet),
        matchId: '',
        market: '',
        outcome: '',
        bookmaker: '',
        odds: 0,
        modelProbability: 0,
        value: 0,
        classification: '',
        stake: 0,
        status: 'pending',
        profit: 0,
        bankrollAfter: 0,
      }
    }

    const bet = asRecord(rawBet)
    const betDoc = asRecord((bet as { _doc?: unknown })._doc)
    const nestedValueBet = asRecord(bet.valueBet)
    const nestedBet = asRecord(bet.bet)
    const parentArray = Array.isArray((bet as { __parentArray?: unknown }).__parentArray)
      ? ((bet as { __parentArray?: unknown[] }).__parentArray ?? [])
      : []
    const parentFirst = asRecord(parentArray[0])
    const sources = [bet, betDoc, nestedValueBet, nestedBet, parentFirst]

    return {
      valueBetId: String(pickFirst(sources, ['valueBetId', 'value_bet_id', 'id']) ?? ''),
      matchId: String(pickFirst(sources, ['matchId', 'match_id']) ?? ''),
      market: String(pickFirst(sources, ['market']) ?? ''),
      outcome: String(pickFirst(sources, ['outcome', 'selection']) ?? ''),
      bookmaker: String(pickFirst(sources, ['bookmaker']) ?? ''),
      bookmakerUrl: (() => {
        const url = pickFirst(sources, ['bookmakerUrl', 'bookmaker_url'])
        return typeof url === 'string' ? url : undefined
      })(),
      odds: toNumber(pickFirst(sources, ['odds', 'bookmakerOdds', 'bookmaker_odds', 'decimalOdds'])),
      modelProbability: toNumber(pickFirst(sources, ['modelProbability', 'model_probability', 'probability'])),
      value: toNumber(pickFirst(sources, ['value', 'valueScore', 'value_score'])),
      classification: String(pickFirst(sources, ['classification', 'valueCategory', 'value_category']) ?? ''),
      stake: toNumber(pickFirst(sources, ['stake', 'stakeAmount', 'stake_amount'])),
      status: normalizeStatus(pickFirst(sources, ['status', 'result'])),
      profit: toNumber(pickFirst(sources, ['profit', 'profitLoss', 'profit_loss'])),
      bankrollAfter: toNumber(pickFirst(sources, ['bankrollAfter', 'bankroll_after', 'bankroll', 'currentBankrollAfter', 'current_bankroll_after'])),
    }
  }

  const bets = (sim.bets ?? []).map((bet) => normalizeBet(bet))
  const wonFromBets = bets.filter((b) => b.status === 'won').length
  const lostFromBets = bets.filter((b) => b.status === 'lost').length
  const pendingFromBets = bets.filter((b) => b.status === 'pending').length
  const totalBets = bets.length > 0 ? bets.length : toNumber((sim as Partial<Simulation>).totalBets)
  const wonBets = bets.length > 0 ? wonFromBets : toNumber((sim as Partial<Simulation>).wonBets)
  const lostBets = bets.length > 0 ? lostFromBets : toNumber((sim as Partial<Simulation>).lostBets)
  const pendingBets = bets.length > 0 ? pendingFromBets : toNumber((sim as Partial<Simulation>).pendingBets)
  const resolvedBets = bets.filter((b) => b.status === 'won' || b.status === 'lost')
  const totalStaked = bets.length > 0
    ? resolvedBets.reduce((acc, b) => acc + (b.stake ?? 0), 0)
    : toNumber((sim as Partial<Simulation>).totalStaked)
  const totalProfit = bets.length > 0
    ? bets.reduce((acc, b) => acc + (b.profit ?? 0), 0)
    : toNumber((sim as Partial<Simulation>).totalProfit)
  const settledCount = bets.length > 0 ? resolvedBets.length : wonBets + lostBets

  let peak = sim.initialBankroll ?? 0
  let maxDrawdown = 0
  for (const bet of bets) {
    const bankrollAfter = bet.bankrollAfter ?? 0
    if (bankrollAfter > peak) peak = bankrollAfter
    if (peak > 0) {
      const drawdown = (peak - bankrollAfter) / peak
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
    }
  }

  return {
    id: sim.id,
    userId: sim.userId,
    name: sim.name ?? '',
    initialBankroll: sim.initialBankroll ?? 0,
    currentBankroll: sim.currentBankroll ?? sim.initialBankroll ?? 0,
    strategy: sim.strategy ?? 'flat',
    flatStakeAmount: sim.flatStakeAmount ?? 0,
    percentageStake: sim.percentageStake ?? 0,
    kellyFraction: sim.kellyFraction ?? 0.5,
    minOdds: sim.minOdds ?? 0,
    maxOdds: sim.maxOdds ?? 0,
    minValue: sim.minValue ?? 0,
    onlyHighValue: sim.onlyHighValue ?? false,
    projectPending: sim.projectPending ?? false,
    dateFrom: sim.dateFrom ?? '',
    dateTo: sim.dateTo ?? '',
    status: sim.status ?? 'pending',
    bets,
    totalBets,
    wonBets,
    lostBets,
    pendingBets,
    totalStaked,
    totalProfit,
    roi: totalStaked > 0 ? totalProfit / totalStaked : toNumber(sim.roi),
    hitRate: settledCount > 0 ? wonBets / settledCount : toNumber(sim.hitRate),
    maxDrawdown: maxDrawdown > 0 ? maxDrawdown : toNumber(sim.maxDrawdown),
    createdAt: sim.createdAt ?? new Date().toISOString(),
  }
}

function normalizeBankroll(bankroll: BackendBankroll): Bankroll {
  const initialBankroll = bankroll.initialBankroll ?? 1000
  const currentBankroll = bankroll.currentBankroll ?? initialBankroll
  const profitLoss = currentBankroll - initialBankroll
  const roi = initialBankroll > 0 ? profitLoss / initialBankroll : 0
  const stopLossEnabled = bankroll.stopLossEnabled ?? false
  const stopLossPercentage = bankroll.stopLossPercentage ?? 20
  const isStopped =
    stopLossEnabled &&
    initialBankroll > 0 &&
    (initialBankroll - currentBankroll) / initialBankroll >= stopLossPercentage / 100

  return {
    id: bankroll.id ?? '',
    userId: bankroll.userId ?? '',
    initialBankroll,
    currentBankroll,
    minBetPercentage: bankroll.minBetPercentage ?? 1,
    maxBetPercentage: bankroll.maxBetPercentage ?? 5,
    strategy: bankroll.strategy ?? 'kelly',
    useKellyCriterion: bankroll.useKellyCriterion ?? true,
    kellyFraction: bankroll.kellyFraction ?? 0.5,
    stopLossEnabled,
    stopLossPercentage,
    currency: bankroll.currency ?? 'USD',
    isActive: bankroll.isActive ?? true,
    profitLoss,
    roi,
    isStopped,
    createdAt: bankroll.createdAt ?? new Date().toISOString(),
    updatedAt: bankroll.updatedAt ?? new Date().toISOString(),
  }
}

function isNotFoundError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404
}

function normalizeOddsHistory(data: BackendOddsHistoryRow[] | BackendOddsHistorySeries[]): OddsHistory[] {
  if (!Array.isArray(data) || data.length === 0) {
    return []
  }

  const first = data[0] as Partial<BackendOddsHistorySeries>
  if (Array.isArray(first.entries)) {
    return (data as BackendOddsHistorySeries[]).map((row) => ({
      matchId: row.matchId,
      bookmaker: row.bookmaker,
      market: (row.market as OddsHistory['market']) ?? '1X2',
      outcome: row.outcome,
      entries: row.entries
        .map((entry) => ({
          odds: Number(entry.odds),
          timestamp: new Date(entry.timestamp).toISOString(),
        }))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    }))
  }

  const rows = data as BackendOddsHistoryRow[]
  const seriesByKey = new Map<string, OddsHistory>()

  for (const row of rows) {
    const baseBookmaker = row.market ? `${row.bookmaker} (${row.market})` : row.bookmaker
    const timestamp = new Date(row.timestamp).toISOString()
    const outcomes: Array<{ outcome: string; odds?: number }> = [
      { outcome: 'Home', odds: row.homeOdds },
      { outcome: 'Draw', odds: row.drawOdds },
      { outcome: 'Away', odds: row.awayOdds },
    ]

    for (const item of outcomes) {
      if (typeof item.odds !== 'number' || Number.isNaN(item.odds)) {
        continue
      }

      const key = `${baseBookmaker}::${item.outcome}`
      const existing = seriesByKey.get(key)
      if (existing) {
        existing.entries.push({ odds: item.odds, timestamp })
        continue
      }

      seriesByKey.set(key, {
        matchId: row.matchId,
        bookmaker: baseBookmaker,
        market: '1X2',
        outcome: item.outcome,
        entries: [{ odds: item.odds, timestamp }],
      })
    }
  }

  return Array.from(seriesByKey.values()).map((series) => ({
    ...series,
    entries: series.entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
  }))
}

// Queue for failed requests during token refresh
let isRefreshing = false
let failedQueue: Array<{
  resolve: (value: string) => void
  reject: (error: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error)
    } else {
      resolve(token as string)
    }
  })
  failedQueue = []
}

// Request interceptor: attach Bearer token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('accessToken')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor: handle 401 → refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`
            }
            return api(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      const refreshToken = localStorage.getItem('refreshToken')
      if (!refreshToken) {
        processQueue(error, null)
        isRefreshing = false
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        window.location.href = '/login'
        return Promise.reject(error)
      }

      try {
        const { data } = await axios.post<AuthTokens>(`${BASE_URL}/auth/refresh`, {
          refreshToken,
        })
        localStorage.setItem('accessToken', data.accessToken)
        localStorage.setItem('refreshToken', data.refreshToken)
        processQueue(null, data.accessToken)
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
        }
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

export default api

// Auth API
export const authApi = {
  login: (credentials: LoginCredentials) =>
    api.post<{ user: User; accessToken: string; refreshToken: string }>('/auth/login', credentials).then((r) => r.data),

  register: (data: RegisterData) =>
    api.post<{ user: User; accessToken: string; refreshToken: string }>('/auth/register', data).then((r) => r.data),

  refreshToken: (refreshToken: string) =>
    api.post<AuthTokens>('/auth/refresh', { refreshToken }).then((r) => r.data),

  getMe: () => api.get<User>('/auth/me').then((r) => r.data),
}

// Matches API
export const matchesApi = {
  getMatches: (params?: Record<string, string | number>) =>
    api.get<PaginatedResponse<Match>>('/matches', { params }).then((r) => r.data),

  getMatch: (id: string) => api.get<Match>(`/matches/${id}`).then((r) => r.data),

  getMatchStats: (id: string) => api.get<MatchStats>(`/matches/${id}/stats`).then((r) => r.data),
}

// Odds API
export const oddsApi = {
  getOdds: (matchId: string) =>
    api.get<OddsEntry[]>(`/odds/${matchId}`).then((r) => r.data),

  getOddsHistory: (matchId: string, market?: string) =>
    api
      .get<BackendOddsHistoryRow[] | BackendOddsHistorySeries[]>(`/odds/${matchId}/history`, {
        params: market ? { market } : undefined,
      })
      .then((r) => normalizeOddsHistory(r.data)),

  getSteamAlerts: (matchId: string) =>
    api.get<SteamAlert[]>(`/odds/${matchId}/steam-alerts`).then((r) => r.data),
}

// Predictions API
export const predictionsApi = {
  getPrediction: (matchId: string) =>
    api.get<BackendPrediction>(`/predictions/${matchId}`).then((r) => normalizePrediction(r.data)),

  runPrediction: (matchId: string) =>
    api.post<BackendPrediction>(`/predictions/${matchId}/run`).then((r) => normalizePrediction(r.data)),

  getMatchOpportunities: (matchId: string) =>
    api.get<MatchPredictionInsights>(`/predictions/${matchId}/opportunities`).then((r) => r.data),

  getTodayOpportunities: (filters?: TodayOpportunitiesFilters) =>
    api
      .get<MatchPredictionInsights[]>('/predictions/opportunities/today', {
        params: {
          limit: filters?.limit,
          leagueIds: filters?.leagueIds?.length ? filters.leagueIds.join(',') : undefined,
          countries: filters?.countries?.length ? filters.countries.join(',') : undefined,
          internationalOnly: filters?.internationalOnly ? 'true' : undefined,
        },
      })
      .then((r) => r.data)
      .catch((err) => (isNotFoundError(err) ? [] : Promise.reject(err))),

  getLiveOpportunities: (filters?: LiveOpportunitiesFilters) =>
    api
      .get<PersistedPredictionOpportunity[]>('/predictions/opportunities/live', {
        params: {
          limit: filters?.limit ?? 50,
          leagueIds: filters?.leagueIds?.length ? filters.leagueIds.join(',') : undefined,
          countries: filters?.countries?.length ? filters.countries.join(',') : undefined,
          internationalOnly: filters?.internationalOnly ? 'true' : undefined,
        },
      })
      .then((r) => r.data)
      .catch((err) => (isNotFoundError(err) ? [] : Promise.reject(err))),

  getOpportunityStats: () =>
    api
      .get<OpportunityMarketStats[]>('/predictions/opportunities/stats')
      .then((r) => r.data)
      .catch((err) => (isNotFoundError(err) ? [] : Promise.reject(err))),

  getOpportunityHistory: (matchId: string, limit = 100) =>
    api
      .get<PersistedPredictionOpportunity[]>(`/predictions/${matchId}/opportunities/history`, { params: { limit } })
      .then((r) => r.data)
      .catch((err) => (isNotFoundError(err) ? [] : Promise.reject(err))),

  recalculateAll: (params?: { statuses?: Array<'scheduled' | 'live' | 'finished' | 'cancelled'>; limit?: number }) =>
    api
      .post<RecalculatePredictionsResult>('/predictions/recalculate/all', {}, {
        params: {
          statuses: params?.statuses?.length ? params.statuses.join(',') : undefined,
          limit: params?.limit,
        },
      })
      .then((r) => r.data),
}

// Value Bets API
export const valueBetsApi = {
  getValueBets: (filters?: ValueBetFilters) =>
    api
      .get<{ data: BackendValueBet[]; total: number; page?: number; limit?: number; totalPages?: number }>('/value-bets', {
        params: filters as Record<string, string | number | undefined>,
      })
      .then((r) => {
        const page = Number(filters?.page ?? r.data.page ?? 1)
        const limit = Number(filters?.limit ?? r.data.limit ?? 20)
        const normalizedData = (r.data.data ?? []).map(normalizeValueBet)
        const total = Number(r.data.total ?? normalizedData.length)

        return {
          data: normalizedData,
          total,
          page,
          limit,
          totalPages: r.data.totalPages ?? Math.max(1, Math.ceil(total / Math.max(limit, 1))),
        } as PaginatedResponse<ValueBet>
      }),

  getValueBet: (id: string) =>
    api.get<BackendValueBet[]>(`/value-bets/match/${id}`).then((r) => (r.data[0] ? normalizeValueBet(r.data[0]) : null)),
}

export const resolveValueBet = (id: string, status: BetStatus, stakeAmount?: number) =>
  api.patch<ValueBet>(`/value-bets/${id}/resolve`, { status, stakeAmount }).then((r) => r.data)

// Bankroll API
export const bankrollApi = {
  getBankroll: () => api.get<BackendBankroll>('/bankroll').then((r) => normalizeBankroll(r.data)),

  updateBankroll: (data: UpdateBankrollData) =>
    api.put<BackendBankroll>('/bankroll', data).then((r) => normalizeBankroll(r.data)),

  getStakeRecommendation: (modelProbability: number, decimalOdds: number) =>
    api
      .get<StakeRecommendation>('/bankroll/stake-recommendation', {
        params: { modelProbability, decimalOdds },
      })
      .then((r) => r.data),
}

// Analytics API
export const analyticsApi = {
  getSummary: () => api.get<AnalyticsSummary>('/analytics/summary').then((r) => r.data),

  getDailyPerformance: (days?: number) =>
    api
      .get<DailyPerformance[]>('/analytics/daily-performance', { params: days ? { days } : undefined })
      .then((r) => r.data),

  getPerformanceByCategory: () =>
    api.get<PerformanceByCategory[]>('/analytics/performance-by-category').then((r) => r.data),

  getPerformanceByMarket: () =>
    api.get<PerformanceByMarket[]>('/analytics/performance-by-market').then((r) => r.data),
}

// Simulator API
export const simulatorApi = {
  runSimulation: (params: RunSimulationParams) =>
    api.post<BackendSimulation>('/simulator/run', params).then((r) => normalizeSimulation(r.data)),

  getSimulations: (params?: { page?: number; limit?: number }) =>
    api
      .get<PaginatedResponse<BackendSimulation>>('/simulator', { params })
      .then((r) => ({
        ...r.data,
        data: r.data.data.map((sim) => normalizeSimulation(sim)),
      })),

  getSimulation: (id: string) =>
    api.get<BackendSimulation>(`/simulator/${id}`).then((r) => normalizeSimulation(r.data)),

  getSimulationSummary: (id: string) =>
    api.get<BackendSimulation>(`/simulator/${id}/summary`).then((r) => normalizeSimulation(r.data)),

  getSimulationBets: (id: string, params?: { page?: number; limit?: number }) =>
    api
      .get<{ bets: Array<Record<string, unknown>>; total: number; page: number; limit: number }>(`/simulator/${id}/bets`, { params })
      .then((r) => {
        const toNumber = (value: unknown, fallback = 0): number => {
          if (typeof value === 'number' && Number.isFinite(value)) return value
          const parsed = Number(value)
          return Number.isFinite(parsed) ? parsed : fallback
        }

        const asRecord = (value: unknown): Record<string, unknown> => {
          if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
          return {}
        }

        const pickFirst = (sources: Array<Record<string, unknown>>, keys: string[]): unknown => {
          for (const source of sources) {
            for (const key of keys) {
              if (source[key] !== undefined && source[key] !== null) return source[key]
            }
          }
          return undefined
        }

        const normalizeStatus = (value: unknown): Simulation['bets'][number]['status'] => {
          const raw = String(value ?? '').trim().toLowerCase()
          if (raw === 'won' || raw === 'resolved_won' || raw === 'win') return 'won'
          if (raw === 'lost' || raw === 'resolved_lost' || raw === 'loss') return 'lost'
          if (raw === 'void' || raw === 'cancelled' || raw === 'canceled') return 'void'
          return 'pending'
        }

        const bets = (r.data.bets ?? []).map((rawBet) => {
          const bet = asRecord(rawBet)
          const betDoc = asRecord((bet as { _doc?: unknown })._doc)
          const nestedValueBet = asRecord(bet.valueBet)
          const nestedBet = asRecord(bet.bet)
          const parentArray = Array.isArray((bet as { __parentArray?: unknown }).__parentArray)
            ? ((bet as { __parentArray?: unknown[] }).__parentArray ?? [])
            : []
          const parentFirst = asRecord(parentArray[0])
          const sources = [bet, betDoc, nestedValueBet, nestedBet, parentFirst]

          return {
            valueBetId: String(pickFirst(sources, ['valueBetId', 'value_bet_id', 'id']) ?? ''),
            matchId: String(pickFirst(sources, ['matchId', 'match_id']) ?? ''),
            market: String(pickFirst(sources, ['market']) ?? ''),
            outcome: String(pickFirst(sources, ['outcome', 'selection']) ?? ''),
            bookmaker: String(pickFirst(sources, ['bookmaker']) ?? ''),
            bookmakerUrl: (() => {
              const url = pickFirst(sources, ['bookmakerUrl', 'bookmaker_url'])
              return typeof url === 'string' ? url : undefined
            })(),
            odds: toNumber(pickFirst(sources, ['odds', 'bookmakerOdds', 'bookmaker_odds', 'decimalOdds'])),
            modelProbability: toNumber(pickFirst(sources, ['modelProbability', 'model_probability', 'probability'])),
            value: toNumber(pickFirst(sources, ['value', 'valueScore', 'value_score'])),
            classification: String(pickFirst(sources, ['classification', 'valueCategory', 'value_category']) ?? ''),
            stake: toNumber(pickFirst(sources, ['stake', 'stakeAmount', 'stake_amount'])),
            status: normalizeStatus(pickFirst(sources, ['status', 'result'])),
            profit: toNumber(pickFirst(sources, ['profit', 'profitLoss', 'profit_loss'])),
            bankrollAfter: toNumber(pickFirst(sources, ['bankrollAfter', 'bankroll_after', 'bankroll', 'currentBankrollAfter', 'current_bankroll_after'])),
          }
        })

        return {
          ...r.data,
          bets,
        }
      }),

  getSimulationChart: (id: string) =>
    api.get<SimulationChartPoint[]>(`/simulator/${id}/chart`).then((r) => r.data),

  refreshSimulation: (id: string) =>
    api.post<{ refreshed: number; currentBankroll?: number; message?: string }>(`/simulator/${id}/refresh`).then((r) => r.data),
}

// Data ingestion API
export const dataIngestionApi = {
  getLogs: (filters?: IngestionLogFilters) =>
    api
      .get<IngestionLog[]>('/data-ingestion/logs', {
        params: {
          limit: filters?.limit,
          processType: filters?.processType && filters.processType !== 'all' ? filters.processType : undefined,
          trigger: filters?.trigger && filters.trigger !== 'all' ? filters.trigger : undefined,
          status: filters?.status && filters.status !== 'all' ? filters.status : undefined,
          fallbackUsed: filters?.fallbackUsed && filters.fallbackUsed !== 'all' ? filters.fallbackUsed : undefined,
        },
      })
      .then((r) => r.data),

  runFixtureSync: (params?: RunIngestionParams) =>
    api.post<IngestionSummary>('/data-ingestion/run-fixtures', undefined, { params }).then((r) => r.data),

  runOddsIngestion: (params?: RunIngestionParams) =>
    api.post<IngestionSummary>('/data-ingestion/run-odds', undefined, { params }).then((r) => r.data),

  runAllLeagues: (date?: string) =>
    api
      .post<IngestionSummary[]>('/data-ingestion/run-all-leagues', undefined, {
        params: date ? { date } : undefined,
      })
      .then((r) => r.data),
}

export const bookmakerCredentialsApi = {
  getProviders: () =>
    api.get<BookmakerProvider[]>('/bookmaker-credentials/providers').then((r) => r.data),

  list: () =>
    api.get<BookmakerCredentialsSafeView[]>('/bookmaker-credentials').then((r) => r.data),

  upsert: (data: UpsertBookmakerCredentialsData) =>
    api.post<BookmakerCredentialsSafeView>('/bookmaker-credentials', data).then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ ok: boolean }>(`/bookmaker-credentials/${id}`).then((r) => r.data),
}

export const betAutomationApi = {
  getProvidersStatus: () =>
    api.get<AutomationProviderStatus[]>('/bet-automation/providers').then((r) => r.data),

  run: (params: RunBookmakerAutomationParams) =>
    api.post<AutomationRunResult>('/bet-automation/run', params).then((r) => r.data),
}

export const autoBetsApi = {
  list: (params?: { status?: AutoBetStatus; page?: number; limit?: number }) =>
    api
      .get<{ data: AutoBet[]; total: number }>('/auto-bets', { params })
      .then((r) => r.data),

  getAnalytics: () =>
    api.get<AutoBetsAnalytics>('/auto-bets/analytics').then((r) => r.data),

  executeAll: () =>
    api.post<{ executed: number; failed: number }>('/auto-bets/execute-all').then((r) => r.data),

  execute: (id: string) =>
    api.post<AutoBet>(`/auto-bets/${id}/execute`).then((r) => r.data),

  cancel: (id: string) =>
    api.patch<AutoBet>(`/auto-bets/${id}/cancel`).then((r) => r.data),

  updateOutcome: (id: string, data: UpdateAutoBetOutcome) =>
    api.patch<AutoBet>(`/auto-bets/${id}/outcome`, data).then((r) => r.data),
}
