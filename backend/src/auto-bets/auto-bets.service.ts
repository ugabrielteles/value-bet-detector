import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AutoBetsRepository } from './infrastructure/repositories/auto-bets.repository';
import { AutoBetEntity, AutoBetStatus } from './domain/entities/auto-bet.entity';
import { BankrollService } from '../bankroll/bankroll.service';
import { BetAutomationService } from '../bet-automation/bet-automation.service';
import { ValueBetsRepository } from '../value-bets/infrastructure/repositories/value-bets.repository';
import { ValueBetEntity } from '../value-bets/domain/entities/value-bet.entity';
import { UpdateAutoOutcomeDto } from './application/dtos/update-auto-outcome.dto';
import { MatchesService } from '../matches/matches.service';
import { PredictionsService } from '../predictions/predictions.service';

export interface AutoBetsAnalytics {
  // Counters
  totalAutoBets: number;
  queued: number;
  placing: number;
  placed: number;
  won: number;
  lost: number;
  failed: number;
  skipped: number;
  cancelled: number;
  void: number;
  // Performance
  winRate: number;
  roi: number;
  totalStaked: number;
  totalProfit: number;
  avgStake: number;
  // Bankroll
  bankrollCurrent: number;
  bankrollImpact: number;
  stopLossTriggered: boolean;
  todaySuccessfulPlaced: number;
  dailySuccessfulLimit: number;
  // Breakdown
  byBookmaker: Array<{
    bookmaker: string;
    totalBets: number;
    won: number;
    winRate: number;
    totalStaked: number;
    totalProfit: number;
    roi: number;
  }>;
  byMarket: Array<{
    market: string;
    totalBets: number;
    won: number;
    winRate: number;
    totalStaked: number;
    totalProfit: number;
    roi: number;
  }>;
  dailyPnl: Array<{
    date: string;
    bets: number;
    staked: number;
    profit: number;
    cumulativeProfit: number;
  }>;
}

@Injectable()
export class AutoBetsService {
  private readonly logger = new Logger(AutoBetsService.name);
  // Start with a small lookback window so existing recent pending value-bets
  // can still be enqueued after service restart.
  private lastPollTime = new Date(Date.now() - 15 * 60 * 1000);
  private readonly pollLookbackMs = Math.max(
    5,
    Number(process.env.AUTO_BETS_POLL_LOOKBACK_MINUTES || '120'),
  ) * 60 * 1000;
  private readonly orphanGraceMs = Math.max(
    5,
    Number(process.env.AUTO_BETS_ORPHAN_GRACE_MINUTES || '30'),
  ) * 60 * 1000;
  private readonly staleScheduledGraceMs = Math.max(
    15,
    Number(process.env.AUTO_BETS_SCHEDULED_STALE_MINUTES || '180'),
  ) * 60 * 1000;
  private readonly missingMatchLogCooldownMs = 10 * 60 * 1000;
  private readonly missingMatchLastLogAt = new Map<string, number>();
  private readonly nonLiveLogCooldownMs = 10 * 60 * 1000;
  private readonly nonLiveLastLogAt = new Map<string, number>();

  private resolveAutomationProvider(bookmaker: string): 'betano' | 'bet365' | null {
    const normalized = String(bookmaker || '').trim().toLowerCase();
    if (normalized.includes('betano')) return 'betano';
    if (normalized.includes('bet365')) return 'bet365';
    return null;
  }

  private hasUsableEventUrl(bookmaker: string, url: string): boolean {
    const value = String(url || '').trim();
    if (!value) return false;

    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase().replace(/\/+$/, '') || '/';
      const isGenericPath = path === '/' || path === '/sport' || path === '/sports';

      if ((host.includes('betano') || host.includes('bet365')) && isGenericPath) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  private async resolveMatch(matchRef: string) {
    const ref = String(matchRef || '').trim();
    if (!ref) return null;

    // Newer/legacy records may store either external matchId or Mongo _id.
    const byExternalId = await this.matchesService.findByMatchId(ref);
    if (byExternalId) return byExternalId;

    try {
      return await this.matchesService.findById(ref);
    } catch {
      return null;
    }
  }

  private shouldLogMissingMatch(key: string): boolean {
    const now = Date.now();
    const last = this.missingMatchLastLogAt.get(key) ?? 0;
    if (now - last < this.missingMatchLogCooldownMs) return false;
    this.missingMatchLastLogAt.set(key, now);
    return true;
  }

  private shouldLogNonLive(key: string): boolean {
    const now = Date.now();
    const last = this.nonLiveLastLogAt.get(key) ?? 0;
    if (now - last < this.nonLiveLogCooldownMs) return false;
    this.nonLiveLastLogAt.set(key, now);
    return true;
  }

  private isMissingBookmakerEventError(message: string): boolean {
    const normalized = String(message || '').trim().toLowerCase();
    if (!normalized) return false;

    return normalized.includes('could not resolve betano event automatically')
      || normalized.includes('team-search fallback failed')
      || normalized.includes('event not found at bookmaker')
      || normalized.includes('match not found at bookmaker');
  }

  private isUnavailableBookmakerMarketError(message: string): boolean {
    const normalized = String(message || '').trim().toLowerCase();
    if (!normalized) return false;

    return normalized.includes('no available betano markets for this event')
      || normalized.includes('no available betano markets for requested selection')
      || normalized.includes('there are currently no available markets in this event');
  }

  constructor(
    private readonly autoBetsRepository: AutoBetsRepository,
    private readonly bankrollService: BankrollService,
    private readonly betAutomationService: BetAutomationService,
    private readonly valueBetsRepository: ValueBetsRepository,
    private readonly matchesService: MatchesService,
    private readonly predictionsService: PredictionsService,
  ) {}

  /**
   * Cron: every 3 minutes, recover bets stuck in 'placing' state for > 10 minutes.
   * This handles crashes or network failures that left a bet mid-execution.
   */
  @Cron('0 */3 * * * *')
  async recoverStuckPlacingBets(): Promise<void> {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);
    const stuckBets = await this.autoBetsRepository.findStuckPlacing(cutoff);
    for (const bet of stuckBets) {
      await this.autoBetsRepository.update(bet.id, {
        status: 'failed',
        automationError: 'Execution timed out in placing state (process crash or network failure)',
        automationLog: [
          ...bet.automationLog,
          `AUTO-FAILED at ${new Date().toISOString()}: stuck in placing > 10 minutes`,
        ],
      });
      this.logger.warn(`[PlacingRecovery] Bet ${bet.id} (user=${bet.userId}) stuck in placing > 10min → marked failed`);
    }
  }

  /**
   * Cron: resolve automatically all placed auto-bets whose match is finished.
   */
  @Cron('0 */3 * * * *')
  async autoResolvePlacedBets(): Promise<void> {
    // Busca todas as apostas automáticas com status 'placed'
    const placedBets = await this.autoBetsRepository.findPlaced();
    for (const bet of placedBets) {
      // Busca o status do evento (match)
      const match = await this.matchesService.findByMatchId(bet.matchId);
      if (!match || match.status !== 'finished') continue;

      // Use predictionsService to evaluate the result for all relevant markets
      // Map bet.outcome to selection string as used in predictions
      let selection = bet.outcome;
      // Heuristic mapping for common markets
      if (bet.market.toLowerCase().includes('1x2') || bet.market.toLowerCase().includes('resultado final')) {
        if (bet.outcome === 'home') selection = 'Home Win';
        else if (bet.outcome === 'away') selection = 'Away Win';
        else if (bet.outcome === 'draw') selection = 'Draw';
      }

      // Call predictionsService's evaluation logic
      let result = this.predictionsService['evaluateOpportunityResultBySelection'](
        match,
        bet.market,
        selection,
      );

      // Only allow 'won', 'lost', or 'void' for outcome
      let outcome: 'won' | 'lost' | 'void';
      if (result === 'won' || result === 'lost' || result === 'void') {
        outcome = result;
      } else {
        outcome = 'void';
      }

      // Atualiza o status da aposta
      await this.updateOutcome(bet.userId, bet.id, { outcome });
      this.logger.log(`[AutoResolve] Bet ${bet.id} resolved as ${outcome}`);
    }
  }

  /**
   * Called by ValueBetsService when a new value bet is detected.
   * Checks bankroll settings and enqueues the bet if automation is on.
   */
  async processNewValueBet(userId: string, valueBet: ValueBetEntity): Promise<AutoBetEntity | null> {
    const missingMatchKey = `${userId}:${String(valueBet.matchId || '').trim()}`;
    const match = await this.resolveMatch(valueBet.matchId);
    if (!match) {
      const detectedAt = valueBet.detectedAt ? new Date(valueBet.detectedAt).getTime() : Date.now();
      const isOrphanStale = Date.now() - detectedAt >= this.orphanGraceMs;

      if (isOrphanStale) {
        await this.valueBetsRepository.update(valueBet.id, { isActive: false });
        this.logger.warn(
          `AutoBet orphan cleanup [user=${userId}, valueBet=${valueBet.id}]: match not found (${valueBet.matchId}), deactivated value bet`,
        );
        this.missingMatchLastLogAt.delete(missingMatchKey);
        return null;
      }

      if (this.shouldLogMissingMatch(missingMatchKey)) {
        this.logger.debug(
          `AutoBet skip [user=${userId}, valueBet=${valueBet.id}]: match not found (${valueBet.matchId}) - waiting grace window`,
        );
      }
      this.logger.debug(`[AutoBet][BLOCK] Motivo: match não encontrado para valueBet=${valueBet.id}`);
      return null;
    }

    this.missingMatchLastLogAt.delete(missingMatchKey);
    const nonLiveKey = `${userId}:${match.status}`;

    if (match.status !== 'live') {
      if (match.status === 'finished' || match.status === 'cancelled') {
        await this.valueBetsRepository.update(valueBet.id, { isActive: false });
        this.logger.warn(
          `AutoBet stale cleanup [user=${userId}, valueBet=${valueBet.id}]: match status=${match.status}, deactivated value bet`,
        );
        this.nonLiveLastLogAt.delete(nonLiveKey);
        return null;
      }

      if (match.status === 'scheduled') {
        const startAt = match.startTime ? new Date(match.startTime).getTime() : NaN;
        const isStaleScheduled = Number.isFinite(startAt) && (Date.now() - startAt) >= this.staleScheduledGraceMs;
        if (isStaleScheduled) {
          await this.valueBetsRepository.update(valueBet.id, { isActive: false });
          this.logger.warn(
            `AutoBet stale cleanup [user=${userId}, valueBet=${valueBet.id}]: scheduled match passed grace window, deactivated value bet`,
          );
          this.nonLiveLastLogAt.delete(nonLiveKey);
          return null;
        }
      }

      if (this.shouldLogNonLive(nonLiveKey)) {
        this.logger.debug(
          `AutoBet skip [user=${userId}, valueBet=${valueBet.id}]: match status is ${match.status}, only live is allowed`,
        );
      }
      this.logger.debug(`[AutoBet][BLOCK] Motivo: status do match (${match.status}) não é ao vivo para valueBet=${valueBet.id}`);
      return null;
    }

    this.nonLiveLastLogAt.delete(nonLiveKey);

    const bankroll = await this.bankrollService.getBankroll(userId);
    const betProvider = this.resolveAutomationProvider(valueBet.bookmaker) ?? valueBet.bookmaker.toLowerCase().trim();
    const configuredProvider = String(bankroll.autoBetProvider || '').toLowerCase().trim();

    // Auto-bet feature gate
    if (!bankroll.autoBetEnabled) {
      this.logger.debug(`AutoBet skip [user=${userId}, valueBet=${valueBet.id}]: autoBetEnabled=false`);
      this.logger.debug(`[AutoBet][BLOCK] Motivo: autoBetEnabled=false para user=${userId}`);
      return null;
    }
    if (!bankroll.autoBetProvider) {
      this.logger.debug(`AutoBet skip [user=${userId}, valueBet=${valueBet.id}]: autoBetProvider not configured`);
      this.logger.debug(`[AutoBet][BLOCK] Motivo: autoBetProvider não configurado para user=${userId}`);
      return null;
    }

    // Only bet on the configured provider's bookmaker
    if (configuredProvider !== betProvider) {
      this.logger.debug(
        `AutoBet skip [user=${userId}, valueBet=${valueBet.id}]: provider mismatch configured=${configuredProvider} valueBet=${betProvider}`,
      );
      this.logger.debug(`[AutoBet][BLOCK] Motivo: provider mismatch para user=${userId}, valueBet=${valueBet.id}`);
      return null;
    }

    // Minimum value edge check
    const valueEdgePct = valueBet.value * 100;
    if (valueEdgePct < (bankroll.autoBetMinValue ?? 5)) {      
      this.logger.debug(`[AutoBet][BLOCK] Motivo: valueEdgePct (${valueEdgePct}) < minValue (${bankroll.autoBetMinValue ?? 5}) para valueBet=${valueBet.id}`);
      return null;
    }

    // Minimum classification check
    const classOrder: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    const minClass = bankroll.autoBetMinClassification ?? 'LOW';
    if ((classOrder[valueBet.classification] ?? 0) < (classOrder[minClass] ?? 0)) {
      this.logger.debug(`[AutoBet][BLOCK] Motivo: classificação (${valueBet.classification}) < minClass (${minClass}) para valueBet=${valueBet.id}`);
      return null;
    }

    // Stop-loss check
    if (bankroll.isStopped) {
      this.logger.warn(`AutoBet skipped for user ${userId}: stop-loss triggered`);
      this.logger.debug(`[AutoBet][BLOCK] Motivo: stop-loss ativado para user=${userId}`);
      return this.autoBetsRepository.create({
        userId,
        valueBetId: valueBet.id,
        matchId: valueBet.matchId,
        bookmaker: valueBet.bookmaker,
        bookmakerUrl: valueBet.bookmakerUrl,
        market: valueBet.market,
        outcome: valueBet.outcome,
        bookmakerOdds: valueBet.bookmakerOdds,
        modelProbability: valueBet.modelProbability,
        valueEdge: valueBet.value,
        stakeAmount: 0,
        stakeStrategy: bankroll.strategy,
        bankrollAtBet: bankroll.currentBankroll,
        status: 'skipped',
        automationLog: ['Skipped: stop-loss triggered'],
      });
    }

    // Daily bet limit check
    const maxDaily = bankroll.autoBetMaxDailyBets ?? 20;
    const todayCount = await this.autoBetsRepository.countTodaySuccessfulForUser(userId);
    if (todayCount >= maxDaily) {
      this.logger.warn(`AutoBet skipped for user ${userId}: daily successful limit reached (${todayCount}/${maxDaily})`);
      this.logger.debug(`[AutoBet][BLOCK] Motivo: daily limit atingido para user=${userId}`);
      return null;
    }

    // Prevent duplicate
    const exists = await this.autoBetsRepository.existsForValueBet(userId, valueBet.id);
    if (exists) {
      this.logger.debug(`[AutoBet][BLOCK] Motivo: já existe autoBet para valueBet=${valueBet.id}`);
      return null;
    }

    // Calculate stake
    const stakeRec = await this.bankrollService.getStakeRecommendation(
      userId,
      valueBet.modelProbability,
      valueBet.bookmakerOdds,
      betProvider,
    );

    if (stakeRec.isStopped || stakeRec.recommendedStake <= 0) {
      this.logger.debug(`[AutoBet][BLOCK] Motivo: stakeRec.isStopped=${stakeRec.isStopped} ou stake <= 0 para valueBet=${valueBet.id}`);
      return null;
    }

    const autoBet = await this.autoBetsRepository.create({
      userId,
      valueBetId: valueBet.id,
      matchId: valueBet.matchId,
      bookmaker: valueBet.bookmaker,
      bookmakerUrl: valueBet.bookmakerUrl,
      market: valueBet.market,
      outcome: valueBet.outcome,
      bookmakerOdds: valueBet.bookmakerOdds,
      modelProbability: valueBet.modelProbability,
      valueEdge: valueBet.value,
      stakeAmount: stakeRec.recommendedStake,
      stakeStrategy: bankroll.strategy,
      bankrollAtBet: bankroll.providerBalances?.[betProvider] ?? bankroll.currentBankroll,
      status: 'queued',
      automationLog: [
        `Queued at ${new Date().toISOString()}`,
        `Stake: ${stakeRec.recommendedStake.toFixed(2)} (${bankroll.strategy})`,
        `Value edge: ${valueEdgePct.toFixed(2)}%`,
        !this.hasUsableEventUrl(valueBet.bookmaker, String(valueBet.bookmakerUrl || '').trim())
          ? 'No deep event URL detected; Betano team-search fallback will be attempted at execution.'
          : 'Deep event URL detected for direct automation.',
      ],
    });

    this.logger.log(`AutoBet queued for user ${userId}: ${valueBet.market} ${valueBet.outcome} @ ${valueBet.bookmakerOdds}`);
    return autoBet;
  }

  /**
   * Execute a single queued auto-bet via the automation connector.
   */
  async executeBet(userId: string, autoBetId: string): Promise<AutoBetEntity> {
    const autoBet = await this.autoBetsRepository.findByUserAndId(userId, autoBetId);
    if (!autoBet) throw new NotFoundException('Auto-bet not found');
    if (!['queued', 'failed', 'skipped'].includes(autoBet.status)) {
      throw new BadRequestException(`Cannot execute bet in status "${autoBet.status}"`);
    }

    const bankroll = await this.bankrollService.getBankroll(userId);

    const match = await this.resolveMatch(autoBet.matchId);
    if (!match || match.status !== 'live') {
      return this.autoBetsRepository.update(autoBet.id, {
        status: 'skipped',
        automationError: `Match is not live (status=${match?.status ?? 'not_found'})`,
        automationLog: [
          ...autoBet.automationLog,
          `Execution blocked: match is not live (status=${match?.status ?? 'not_found'})`,
        ],
      });
    }

    if (bankroll.isStopped) {
      return this.autoBetsRepository.update(autoBet.id, {
        status: 'skipped',
        automationLog: [...autoBet.automationLog, 'Execution blocked: stop-loss triggered'],
        automationError: 'Stop-loss triggered',
      });
    }

    // Mark as placing
    await this.autoBetsRepository.update(autoBet.id, {
      status: 'placing',
      automationError: undefined,
      automationLog: [
        ...autoBet.automationLog,
        ['failed', 'skipped'].includes(autoBet.status)
          ? `Retry started at ${new Date().toISOString()}`
          : `Execution started at ${new Date().toISOString()}`,
      ],
    });

    const isDryRun = bankroll.autoBetDryRun !== false;
    const provider = this.resolveAutomationProvider(autoBet.bookmaker);
    const eventUrl = String(autoBet.bookmakerUrl || '').trim();
    const hasDeepEventUrl = this.hasUsableEventUrl(autoBet.bookmaker, eventUrl);

    if (!provider) {
      return this.autoBetsRepository.update(autoBet.id, {
        status: 'failed',
        automationError: `Unsupported automation provider from bookmaker "${autoBet.bookmaker}"`,
        automationLog: [...autoBet.automationLog, `FAILED: Unsupported automation provider (${autoBet.bookmaker})`],
      });
    }

    if (!hasDeepEventUrl && provider !== 'betano') {
      return this.autoBetsRepository.update(autoBet.id, {
        status: 'failed',
        automationError: `Missing deep event URL for ${autoBet.bookmaker}; fallback search is available only for Betano`,
        automationLog: [
          ...autoBet.automationLog,
          `FAILED: Missing deep event URL for ${autoBet.bookmaker}; fallback search is available only for Betano`,
        ],
      });
    }

    const marketRetryMaxAttempts = provider === 'betano'
      ? Math.max(1, Number(process.env.AUTO_BETS_MARKET_RETRY_ATTEMPTS || '2'))
      : 1;
    const marketRetryDelayMs = Math.max(1000, Number(process.env.AUTO_BETS_MARKET_RETRY_DELAY_MS || '25000'));
    const retryNotes: string[] = [];

    let result: Record<string, unknown> | undefined;
    for (let attempt = 1; attempt <= marketRetryMaxAttempts; attempt += 1) {
      try {
        result = await this.betAutomationService.run(userId, {
          provider,
          eventUrl: hasDeepEventUrl ? eventUrl : '',
          selectionText: `${autoBet.market} ${autoBet.outcome}`,
          stake: autoBet.stakeAmount,
          dryRun: isDryRun,
          confirmRealBet: !isDryRun,
          homeTeamName: match?.homeTeam?.name,
          awayTeamName: match?.awayTeam?.name,
        });
        break;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);

        if (this.isMissingBookmakerEventError(errMsg)) {
          return this.autoBetsRepository.update(autoBet.id, {
            status: 'skipped',
            automationError: errMsg,
            automationLog: [
              ...autoBet.automationLog,
              ...retryNotes,
              `REMOVED FROM QUEUE: bookmaker event not found`,
              `DETAIL: ${errMsg}`,
            ],
          });
        }

        if (this.isUnavailableBookmakerMarketError(errMsg)) {
          const hasRetryLeft = attempt < marketRetryMaxAttempts;
          if (hasRetryLeft) {
            retryNotes.push(
              `MARKET UNAVAILABLE: attempt ${attempt}/${marketRetryMaxAttempts}`,
              `DETAIL: ${errMsg}`,
              `Waiting ${marketRetryDelayMs}ms before retry`,
            );
            this.logger.warn(
              `AutoBet market unavailable [user=${userId}, autoBet=${autoBet.id}]: retry ${attempt}/${marketRetryMaxAttempts} in ${marketRetryDelayMs}ms`,
            );
            await new Promise((resolve) => setTimeout(resolve, marketRetryDelayMs));
            continue;
          }

          return this.autoBetsRepository.update(autoBet.id, {
            status: 'skipped',
            automationError: errMsg,
            automationLog: [
              ...autoBet.automationLog,
              ...retryNotes,
              `REMOVED FROM QUEUE: bookmaker market unavailable`,
              `DETAIL: ${errMsg}`,
            ],
          });
        }

        return this.autoBetsRepository.update(autoBet.id, {
          status: 'failed',
          automationError: errMsg,
          automationLog: [...autoBet.automationLog, ...retryNotes, `FAILED: ${errMsg}`],
        });
      }
    }

    if (!result) {
      return this.autoBetsRepository.update(autoBet.id, {
        status: 'failed',
        automationError: 'Automation ended without result',
        automationLog: [...autoBet.automationLog, ...retryNotes, 'FAILED: Automation ended without result'],
      });
    }

    const log = Array.isArray(result?.steps)
      ? (result.steps as string[])
      : [`Automation result: ${JSON.stringify(result)}`];

    const placed = await this.autoBetsRepository.update(autoBet.id, {
      status: 'placed',
      placedAt: new Date(),
      automationError: undefined,
      betSlipId: result?.betSlipId as string | undefined,
      automationLog: [...autoBet.automationLog, ...retryNotes, ...log, `Placed at ${new Date().toISOString()}`],
    });

    this.logger.log(`AutoBet placed: ${autoBet.id} | dryRun=${isDryRun}`);
    return placed;
  }

  /**
   * Cron: every 2 minutes, poll new pending value bets for all users
   * with autoBetEnabled=true and enqueue them.
   */
  @Cron('0 */2 * * * *')
  async pollAndEnqueue(): Promise<void> {
    const userIds = await this.bankrollService.getUsersWithAutoBetEnabled();
    if (!userIds.length) return;

    // Overlapping lookback prevents missing bets that were detected before
    // a match turned live (live-only gate would skip them on first pass).
    const lookbackSince = new Date(Date.now() - this.pollLookbackMs);
    const since = new Date(Math.min(this.lastPollTime.getTime(), lookbackSince.getTime()));
    this.lastPollTime = new Date();

    const recentBets = await this.valueBetsRepository.findSince(since);
    if (!recentBets.length) return;

    this.logger.log(
      `AutoBet poll: ${recentBets.length} pending value bet(s) since ${since.toISOString()} for ${userIds.length} user(s)`,
    );

    for (const userId of userIds) {
      for (const bet of recentBets) {
        try {
          await this.processNewValueBet(userId, bet);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`AutoBet enqueue failed [user=${userId}, bet=${bet.id}]: ${msg}`);
        }
      }
    }
  }

  /**
   * Cron: every 5 minutes, auto-execute all queued bets for all users.
   */
  @Cron('0 */5 * * * *')
  async executeAllQueued(): Promise<void> {
    const userIds = await this.bankrollService.getUsersWithAutoBetEnabled();
    if (!userIds.length) return;

    for (const userId of userIds) {
      try {
        const queued = await this.autoBetsRepository.findQueuedForUser(userId);
        if (!queued.length) continue;

        this.logger.log(`AutoBet execute cron: processing ${queued.length} queued bet(s) for user ${userId}`);
        const result = await this.executeAllQueuedForUser(userId);

        this.logger.log(
          `AutoBet execute cron: finished for user ${userId} | executed=${result.executed} failed=${result.failed}`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`AutoBet execute cron failed for user ${userId}: ${msg}`);
      }
    }
  }

  /**
   * Execute all queued bets for a specific user.
   */
  async executeAllQueuedForUser(userId: string, options?: { includeFailed?: boolean }): Promise<{ executed: number; failed: number }> {
    const queued = await this.autoBetsRepository.findQueuedForUser(userId);
    const failedRows = options?.includeFailed ? await this.autoBetsRepository.findFailedForUser(userId) : [];
    const batch = [...queued, ...failedRows];
    let executed = 0;
    let failed = 0;

    for (const bet of batch) {
      try {
        const result = await this.executeBet(userId, bet.id);
        if (result.status === 'placed') executed++;
        else failed++;
      } catch {
        failed++;
      }
    }

    return { executed, failed };
  }

  /**
   * Manually update the outcome of a placed bet (won / lost / void).
   */
  async updateOutcome(userId: string, autoBetId: string, dto: UpdateAutoOutcomeDto): Promise<AutoBetEntity> {
    const autoBet = await this.autoBetsRepository.findByUserAndId(userId, autoBetId);
    if (!autoBet) throw new NotFoundException('Auto-bet not found');

    if (!['placed', 'queued'].includes(autoBet.status)) {
      throw new BadRequestException(`Cannot resolve auto-bet in status "${autoBet.status}"`);
    }

    let actualProfit: number;
    if (dto.outcome === 'won') {
      // winnings = stake * (odds - 1)
      const grossWin = dto.winnings ?? autoBet.stakeAmount * (autoBet.bookmakerOdds - 1);
      actualProfit = grossWin;
    } else if (dto.outcome === 'void') {
      actualProfit = 0; // stake returned
    } else {
      actualProfit = -autoBet.stakeAmount;
    }

    // Apply to bankroll
    await this.bankrollService.applyBetResult(
      userId,
      actualProfit,
      this.resolveAutomationProvider(autoBet.bookmaker) ?? autoBet.bookmaker,
    );

    const resolvedLog = [
      ...autoBet.automationLog,
      `Outcome: ${dto.outcome} | P&L: ${actualProfit >= 0 ? '+' : ''}${actualProfit.toFixed(2)}`,
    ];

    return this.autoBetsRepository.update(autoBet.id, {
      status: dto.outcome,
      actualProfit,
      resolvedAt: new Date(),
      betSlipId: dto.betSlipId ?? autoBet.betSlipId,
      automationLog: resolvedLog,
    });
  }

  /**
   * Cancel a queued auto-bet.
   */
  async cancelBet(userId: string, autoBetId: string): Promise<AutoBetEntity> {
    const autoBet = await this.autoBetsRepository.findByUserAndId(userId, autoBetId);
    if (!autoBet) throw new NotFoundException('Auto-bet not found');
    if (autoBet.status !== 'queued') {
      throw new BadRequestException(`Only queued bets can be cancelled`);
    }
    return this.autoBetsRepository.update(autoBet.id, {
      status: 'cancelled',
      automationLog: [...autoBet.automationLog, `Cancelled at ${new Date().toISOString()}`],
    });
  }

  async getList(
    userId: string,
    filters: { status?: AutoBetStatus | 'all'; page?: number; limit?: number },
  ): Promise<{ data: AutoBetEntity[]; total: number }> {
    return this.autoBetsRepository.findByUser(userId, filters);
  }

  async getAnalytics(userId: string): Promise<AutoBetsAnalytics> {
    const [raw, bankroll] = await Promise.all([
      this.autoBetsRepository.getAnalytics(userId),
      this.bankrollService.getBankroll(userId),
    ]);
    const todaySuccessfulPlaced = await this.autoBetsRepository.countTodaySuccessfulForUser(userId);
    const dailySuccessfulLimit = bankroll.autoBetMaxDailyBets ?? 20;

    const statusMap: Record<string, { count: number; totalStaked: number; totalProfit: number }> = {};
    for (const s of raw.byStatus) {
      statusMap[s.status] = { count: s.count, totalStaked: s.totalStaked, totalProfit: s.totalProfit };
    }

    const get = (key: string) => statusMap[key] ?? { count: 0, totalStaked: 0, totalProfit: 0 };

    const wonCount = get('won').count;
    const lostCount = get('lost').count;
    const settledCount = wonCount + lostCount;

    const totalStaked = Object.values(statusMap).reduce((acc, s) => acc + s.totalStaked, 0);
    const totalProfit = Object.values(statusMap).reduce((acc, s) => acc + s.totalProfit, 0);

    let cumulative = 0;
    const dailyPnl = raw.dailyPnl.map((d) => {
      cumulative += d.profit;
      return { ...d, cumulativeProfit: cumulative };
    });

    return {
      totalAutoBets: Object.values(statusMap).reduce((a, s) => a + s.count, 0),
      queued: get('queued').count,
      placing: get('placing').count,
      placed: get('placed').count,
      won: wonCount,
      lost: lostCount,
      failed: get('failed').count,
      skipped: get('skipped').count,
      cancelled: get('cancelled').count,
      void: get('void').count,
      winRate: settledCount > 0 ? (wonCount / settledCount) * 100 : 0,
      roi: totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0,
      totalStaked,
      totalProfit,
      avgStake:
        Object.values(statusMap).reduce((a, s) => a + s.count, 0) > 0
          ? totalStaked / Object.values(statusMap).reduce((a, s) => a + s.count, 0)
          : 0,
      bankrollCurrent: bankroll.currentBankroll,
      bankrollImpact: bankroll.initialBankroll > 0 ? (totalProfit / bankroll.initialBankroll) * 100 : 0,
      stopLossTriggered: bankroll.isStopped,
      todaySuccessfulPlaced,
      dailySuccessfulLimit,
      byBookmaker: raw.byBookmaker.map((b) => ({
        ...b,
        winRate: b.totalBets > 0 ? (b.won / b.totalBets) * 100 : 0,
        roi: b.totalStaked > 0 ? (b.totalProfit / b.totalStaked) * 100 : 0,
      })),
      byMarket: raw.byMarket.map((m) => ({
        ...m,
        winRate: m.totalBets > 0 ? (m.won / m.totalBets) * 100 : 0,
        roi: m.totalStaked > 0 ? (m.totalProfit / m.totalStaked) * 100 : 0,
      })),
      dailyPnl,
    };
  }
}
