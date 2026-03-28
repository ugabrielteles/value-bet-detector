// Auth
export interface User {
  id: string
  email: string
  username: string
  role: 'admin' | 'user'
  createdAt: string
  updatedAt: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  username: string
  password: string
}

// Sports
export interface League {
  id: string
  name: string
  country: string
  sport: string
}

export interface Team {
  id: string
  name: string
  shortName: string
  logo?: string
}

export interface MatchStats {
  homeXG?: number
  awayXG?: number
  homeShots?: number
  awayShots?: number
  homePossession?: number
  awayPossession?: number
  homeForm?: string[]
  awayForm?: string[]
}

export interface Match {
  id: string
  homeTeam: Team
  awayTeam: Team
  league: League
  startTime: string
  status: 'scheduled' | 'live' | 'finished' | 'cancelled'
  homeScore?: number
  awayScore?: number
  stats?: MatchStats
}

// Odds
export type Market = '1X2' | 'over_under' | 'both_teams_score' | 'asian_handicap'

export interface OddsEntry {
  id: string
  matchId: string
  bookmaker: string
  market: Market
  outcome: string
  odds: number
  timestamp: string
}

export interface OddsHistory {
  matchId: string
  bookmaker: string
  market: Market
  outcome: string
  entries: Array<{ odds: number; timestamp: string }>
}

export interface SteamAlert {
  id: string
  matchId: string
  market: Market
  outcome: string
  previousOdds: number
  currentOdds: number
  changePercent: number
  bookmaker: string
  timestamp: string
}

// Predictions
export interface ModelPrediction {
  outcome: string
  probability: number
  confidence: number
}

export interface PredictionResult {
  id: string
  matchId: string
  modelVersion: string
  predictions: ModelPrediction[]
  createdAt: string
}

// Value Bets
export enum ValueCategory {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export type BetStatus = 'pending' | 'won' | 'lost' | 'void'

export interface ValueBet {
  id: string
  matchId: string
  match?: Match
  market: Market
  outcome: string
  bookmaker: string
  bookmakerOdds: number
  modelProbability: number
  impliedProbability: number
  valueScore: number
  valueCategory: ValueCategory
  value?: number
  classification?: ValueCategory
  status: BetStatus
  detectedAt: string
  resolvedAt?: string
}

export interface ValueBetFilters {
  league?: string
  minOdds?: number
  minValue?: number
  status?: BetStatus | 'all'
  category?: ValueCategory | 'all'
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// WebSocket
export type WebSocketEventType = 'value_bet_detected' | 'odds_updated' | 'steam_alert'

export interface WebSocketEvent<T = unknown> {
  type: WebSocketEventType
  payload: T
  timestamp: string
}

// Bankroll
export type BettingStrategy = 'flat' | 'kelly' | 'percentage'

export interface Bankroll {
  id: string
  userId: string
  initialBankroll: number
  currentBankroll: number
  minBetPercentage: number
  maxBetPercentage: number
  strategy: BettingStrategy
  useKellyCriterion: boolean
  kellyFraction: number
  stopLossEnabled: boolean
  stopLossPercentage: number
  currency: string
  isActive: boolean
  profitLoss: number
  roi: number
  isStopped: boolean
  createdAt: string
  updatedAt: string
}

export interface UpdateBankrollData {
  initialBankroll: number
  minBetPercentage: number
  maxBetPercentage: number
  strategy: BettingStrategy
  useKellyCriterion: boolean
  kellyFraction: number
  stopLossEnabled: boolean
  stopLossPercentage: number
  currency?: string
}

export interface StakeRecommendation {
  recommendedStake: number
  recommendedStakePercentage: number
  kellyStake: number
  flatStake: number
  percentageStake: number
  isStopped: boolean
  stopReason?: string
}

// Analytics
export interface AnalyticsSummary {
  totalBets: number
  settledBets: number
  pendingBets: number
  wonBets: number
  lostBets: number
  voidBets: number
  totalStaked: number
  totalProfit: number
  roi: number
  hitRate: number
  yield: number
  averageOdds: number
  averageValue: number
  highValueBets: number
  mediumValueBets: number
  lowValueBets: number
}

export interface DailyPerformance {
  date: string
  bets: number
  staked: number
  profit: number
  cumulativeProfit: number
  roi: number
}

export interface PerformanceByCategory {
  category: string
  bets: number
  won: number
  staked: number
  profit: number
  roi: number
  hitRate: number
}

export interface PerformanceByMarket {
  market: string
  bets: number
  won: number
  staked: number
  profit: number
  roi: number
  hitRate: number
}

// Simulator
export type SimulationStrategy = 'flat' | 'kelly' | 'percentage'
export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface RunSimulationParams {
  name?: string
  initialBankroll: number
  strategy: SimulationStrategy
  flatStakeAmount?: number
  percentageStake?: number
  kellyFraction?: number
  minOdds?: number
  maxOdds?: number
  minValue?: number
  onlyHighValue?: boolean
  dateFrom?: string
  dateTo?: string
}

export interface SimulationBet {
  valueBetId: string
  matchId: string
  market: string
  outcome: string
  bookmaker: string
  odds: number
  modelProbability: number
  value: number
  classification: string
  stake: number
  status: 'pending' | 'won' | 'lost' | 'void'
  profit: number
  bankrollAfter: number
}

export interface Simulation {
  id: string
  userId: string
  name: string
  initialBankroll: number
  currentBankroll: number
  strategy: SimulationStrategy
  flatStakeAmount: number
  percentageStake: number
  kellyFraction: number
  minOdds: number
  maxOdds: number
  minValue: number
  onlyHighValue: boolean
  dateFrom: string
  dateTo: string
  status: SimulationStatus
  bets: SimulationBet[]
  totalBets: number
  wonBets: number
  lostBets: number
  totalStaked: number
  totalProfit: number
  roi: number
  hitRate: number
  maxDrawdown: number
  createdAt: string
}

export interface SimulationChartPoint {
  index: number
  bankroll: number
  profit: number
  cumulativeProfit: number
  stake: number
  won: boolean
}
