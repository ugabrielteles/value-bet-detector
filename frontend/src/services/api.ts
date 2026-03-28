import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { ValueCategory } from '../types'
import type {
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
  bets?: Simulation['bets']
}

type BackendBankroll = Partial<Bankroll> & {
  id?: string
  userId?: string
}

function normalizeValueBet(bet: BackendValueBet): ValueBet {
  const valueScore = bet.valueScore ?? bet.value ?? 0
  const valueCategory = bet.valueCategory ?? bet.classification ?? ValueCategory.LOW

  return {
    ...bet,
    market: bet.market as ValueBet['market'],
    valueScore,
    valueCategory,
  }
}

function normalizeSimulation(sim: BackendSimulation): Simulation {
  const bets = sim.bets ?? []
  const totalBets = bets.length
  const wonBets = bets.filter((b) => b.status === 'won').length
  const lostBets = bets.filter((b) => b.status === 'lost').length
  const totalStaked = bets.reduce((acc, b) => acc + (b.stake ?? 0), 0)
  const totalProfit = bets.reduce((acc, b) => acc + (b.profit ?? 0), 0)
  const settledCount = bets.filter((b) => b.status !== 'void').length

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
    dateFrom: sim.dateFrom ?? '',
    dateTo: sim.dateTo ?? '',
    status: sim.status ?? 'pending',
    bets,
    totalBets,
    wonBets,
    lostBets,
    totalStaked,
    totalProfit,
    roi: totalStaked > 0 ? totalProfit / totalStaked : 0,
    hitRate: settledCount > 0 ? wonBets / settledCount : 0,
    maxDrawdown,
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
      .get<OddsHistory[]>(`/odds/${matchId}/history`, { params: market ? { market } : undefined })
      .then((r) => r.data),

  getSteamAlerts: (matchId: string) =>
    api.get<SteamAlert[]>(`/odds/${matchId}/steam-alerts`).then((r) => r.data),
}

// Predictions API
export const predictionsApi = {
  getPrediction: (matchId: string) =>
    api.get<PredictionResult>(`/predictions/${matchId}`).then((r) => r.data),

  runPrediction: (matchId: string) =>
    api.post<PredictionResult>(`/predictions/${matchId}/run`).then((r) => r.data),
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

  getSimulations: () =>
    api.get<BackendSimulation[]>('/simulator').then((r) => r.data.map((sim) => normalizeSimulation(sim))),

  getSimulation: (id: string) =>
    api.get<BackendSimulation>(`/simulator/${id}`).then((r) => normalizeSimulation(r.data)),

  getSimulationChart: (id: string) =>
    api.get<SimulationChartPoint[]>(`/simulator/${id}/chart`).then((r) => r.data),
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
}
