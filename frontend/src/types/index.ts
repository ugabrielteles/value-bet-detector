// Auth
export interface User {
  id: string
  email: string
  username: string
  role: 'admin' | 'user'
  roles?: string[]
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
  homeShotsOnTarget?: number
  awayShotsOnTarget?: number
  homeCorners?: number
  awayCorners?: number
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

export interface TeamProjection {
  side: 'home' | 'away'
  expectedGoals: number
  expectedShots: number
  expectedShotsOnTarget: number
  expectedCorners: number
}

export interface BettingOpportunity {
  market: string
  selection: string
  phase: 'pre-match' | 'live'
  confidence: number
  valueEdge?: number
  rationale: string
}

export interface MatchPredictionInsights {
  matchId: string
  matchStartTime?: string
  homeTeamName?: string
  awayTeamName?: string
  matchStatus: Match['status']
  generatedAt: string
  winProbabilities: {
    home: number
    draw: number
    away: number
  }
  projectedTeams: {
    home: TeamProjection
    away: TeamProjection
  }
  projectedTotals: {
    goals: number
    shots: number
    shotsOnTarget: number
    corners: number
  }
  opportunities: BettingOpportunity[]
}

export interface TodayOpportunitiesFilters {
  limit?: number
  leagueIds?: string[]
  countries?: string[]
  internationalOnly?: boolean
}

export type OpportunityResult = 'pending' | 'won' | 'lost' | 'void'

export interface PersistedPredictionOpportunity {
  _id: string
  matchId: string
  matchStartTime?: string
  homeTeamName?: string
  awayTeamName?: string
  leagueId?: string
  leagueName?: string
  leagueCountry?: string
  isInternational?: boolean
  market: string
  selection: string
  phase: 'pre-match' | 'live'
  confidence: number
  valueEdge?: number
  rationale: string
  matchStatus: Match['status']
  result: OpportunityResult
  generatedAt: string
  projectedTotals: {
    goals: number
    shots: number
    shotsOnTarget: number
    corners: number
  }
  winProbabilities: {
    home: number
    draw: number
    away: number
  }
}

export interface LiveOpportunitiesFilters {
  limit?: number
  leagueIds?: string[]
  countries?: string[]
  internationalOnly?: boolean
}

export interface OpportunityMarketStats {
  market: string
  total: number
  won: number
  lost: number
  pending: number
  hitRate: number
}

export interface RecalculatePredictionsResult {
  total: number
  recalculated: number
  failed: number
  failures: string[]
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
  projectPending?: boolean
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
  projectPending?: boolean
  dateFrom: string
  dateTo: string
  status: SimulationStatus
  bets: SimulationBet[]
  totalBets: number
  wonBets: number
  lostBets: number
  pendingBets?: number
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

// Data ingestion
export type IngestionProcessType = 'fixtures' | 'odds'
export type IngestionTriggerType = 'manual' | 'cron'
export type IngestionRunStatus = 'success' | 'partial' | 'failed'

export interface IngestionLog {
  _id: string
  processType: IngestionProcessType
  trigger: IngestionTriggerType
  status: IngestionRunStatus
  date: string
  leagueId: string
  fixturesFetched: number
  matchesUpserted: number
  oddsSaved: number
  fixturesWithNoOdds: number
  fallbackUsed: boolean
  fallbackDate?: string
  errorList: string[]
  errorMessage?: string
  startedAt: string
  finishedAt: string
  durationMs: number
  createdAt: string
  updatedAt: string
}

export interface IngestionLogFilters {
  limit?: number
  processType?: IngestionProcessType | 'all'
  trigger?: IngestionTriggerType | 'all'
  status?: IngestionRunStatus | 'all'
  fallbackUsed?: 'true' | 'false' | 'all'
}

export interface RunIngestionParams {
  leagueId?: string
  date?: string
}

export interface IngestionSummary {
  date: string
  leagueId: string
  fixturesFetched: number
  matchesUpserted: number
  oddsSaved: number
  fixturesWithNoOdds: number
  fallbackUsed: boolean
  fallbackDate?: string
  errors: string[]
}
