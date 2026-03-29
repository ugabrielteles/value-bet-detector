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
  private lastPollTime = new Date();

  constructor(
    private readonly autoBetsRepository: AutoBetsRepository,
    private readonly bankrollService: BankrollService,
    private readonly betAutomationService: BetAutomationService,
    private readonly valueBetsRepository: ValueBetsRepository,
  ) {}

  /**
   * Called by ValueBetsService when a new value bet is detected.
   * Checks bankroll settings and enqueues the bet if automation is on.
   */
  async processNewValueBet(userId: string, valueBet: ValueBetEntity): Promise<AutoBetEntity | null> {
    const bankroll = await this.bankrollService.getBankroll(userId);

    // Auto-bet feature gate
    if (!bankroll.autoBetEnabled) return null;
    if (!bankroll.autoBetProvider) return null;

    // Only bet on the configured provider's bookmaker
    if (bankroll.autoBetProvider !== valueBet.bookmaker.toLowerCase()) return null;

    // Minimum value edge check
    const valueEdgePct = valueBet.value * 100;
    if (valueEdgePct < (bankroll.autoBetMinValue ?? 5)) return null;

    // Minimum classification check
    const classOrder: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    const minClass = bankroll.autoBetMinClassification ?? 'LOW';
    if ((classOrder[valueBet.classification] ?? 0) < (classOrder[minClass] ?? 0)) return null;

    // Stop-loss check
    if (bankroll.isStopped) {
      this.logger.warn(`AutoBet skipped for user ${userId}: stop-loss triggered`);
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
    const todayCount = await this.autoBetsRepository.countTodayForUser(userId);
    if (todayCount >= maxDaily) {
      this.logger.warn(`AutoBet skipped for user ${userId}: daily limit reached (${todayCount}/${maxDaily})`);
      return null;
    }

    // Prevent duplicate
    const exists = await this.autoBetsRepository.existsForValueBet(userId, valueBet.id);
    if (exists) return null;

    // Calculate stake
    const stakeRec = await this.bankrollService.getStakeRecommendation(
      userId,
      valueBet.modelProbability,
      valueBet.bookmakerOdds,
    );

    if (stakeRec.isStopped || stakeRec.recommendedStake <= 0) return null;

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
      bankrollAtBet: bankroll.currentBankroll,
      status: 'queued',
      automationLog: [
        `Queued at ${new Date().toISOString()}`,
        `Stake: ${stakeRec.recommendedStake.toFixed(2)} (${bankroll.strategy})`,
        `Value edge: ${valueEdgePct.toFixed(2)}%`,
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
    if (autoBet.status !== 'queued') {
      throw new BadRequestException(`Cannot execute bet in status "${autoBet.status}"`);
    }

    const bankroll = await this.bankrollService.getBankroll(userId);
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
      automationLog: [...autoBet.automationLog, `Execution started at ${new Date().toISOString()}`],
    });

    const isDryRun = bankroll.autoBetDryRun !== false;

    let result: Record<string, unknown>;
    try {
      result = await this.betAutomationService.run(userId, {
        provider: autoBet.bookmaker as any,
        eventUrl: autoBet.bookmakerUrl || '',
        selectionText: `${autoBet.market} ${autoBet.outcome}`,
        stake: autoBet.stakeAmount,
        dryRun: isDryRun,
        confirmRealBet: !isDryRun,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return this.autoBetsRepository.update(autoBet.id, {
        status: 'failed',
        automationError: errMsg,
        automationLog: [...autoBet.automationLog, `FAILED: ${errMsg}`],
      });
    }

    const log = Array.isArray(result?.steps)
      ? (result.steps as string[])
      : [`Automation result: ${JSON.stringify(result)}`];

    const placed = await this.autoBetsRepository.update(autoBet.id, {
      status: 'placed',
      placedAt: new Date(),
      betSlipId: result?.betSlipId as string | undefined,
      automationLog: [...autoBet.automationLog, ...log, `Placed at ${new Date().toISOString()}`],
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

    const since = this.lastPollTime;
    this.lastPollTime = new Date();

    const recentBets = await this.valueBetsRepository.findSince(since);
    if (!recentBets.length) return;

    this.logger.log(`AutoBet poll: ${recentBets.length} new value bet(s) for ${userIds.length} user(s)`);

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
    // We can't easily iterate all users here without a users repository.
    // The controller's executeAllQueued(userId) serves on-demand execution.
    // This cron is intentionally lightweight; actual per-user execution is triggered via API or polling.
  }

  /**
   * Execute all queued bets for a specific user.
   */
  async executeAllQueuedForUser(userId: string): Promise<{ executed: number; failed: number }> {
    const queued = await this.autoBetsRepository.findQueuedForUser(userId);
    let executed = 0;
    let failed = 0;

    for (const bet of queued) {
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
    await this.bankrollService.applyBetResult(userId, actualProfit);

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
