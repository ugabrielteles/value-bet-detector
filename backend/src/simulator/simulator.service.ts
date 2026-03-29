import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SimulationsRepository } from './infrastructure/repositories/simulations.repository';
import { ValueBetsRepository } from '../value-bets/infrastructure/repositories/value-bets.repository';
import { SimulationEntity, SimulationBetEntity } from './domain/entities/simulation.entity';
import { RunSimulationDto } from './application/dtos/run-simulation.dto';
import { MatchesService } from '../matches/matches.service';
import { MatchEntity } from '../matches/domain/entities/match.entity';
import { ValueBetEntity } from '../value-bets/domain/entities/value-bet.entity';

@Injectable()
export class SimulatorService {
  constructor(
    private readonly simulationsRepository: SimulationsRepository,
    private readonly valueBetsRepository: ValueBetsRepository,
    private readonly matchesService: MatchesService,
  ) {}

  private evaluateValueBetResult(match: MatchEntity, market: string, selection: string): 'pending' | 'won' | 'lost' | 'void' {
    if (match.status === 'cancelled') return 'void';
    if (match.status !== 'finished') return 'pending';

    const hasScore = match.homeScore !== undefined && match.awayScore !== undefined;
    const home = match.homeScore ?? 0;
    const away = match.awayScore ?? 0;
    const totalGoals = home + away;
    const homeCorners = match.stats?.homeCorners;
    const awayCorners = match.stats?.awayCorners;
    const homeSot = match.stats?.homeShotsOnTarget;
    const awaySot = match.stats?.awayShotsOnTarget;
    const normalizedMarket = (market || '').toLowerCase();
    const normalizedSelection = (selection || '').toLowerCase();

    if (normalizedMarket === '1x2') {
      if (!hasScore) return 'pending';
      const isHomeSelection =
        normalizedSelection === 'home' ||
        normalizedSelection === '1' ||
        normalizedSelection.includes('home win') ||
        normalizedSelection.includes('casa') ||
        normalizedSelection.includes('mandante');

      const isAwaySelection =
        normalizedSelection === 'away' ||
        normalizedSelection === '2' ||
        normalizedSelection.includes('away win') ||
        normalizedSelection.includes('visitante');

      const isDrawSelection =
        normalizedSelection === 'draw' ||
        normalizedSelection === 'x' ||
        normalizedSelection.includes('empate');

      if (isHomeSelection) return home > away ? 'won' : 'lost';
      if (isAwaySelection) return away > home ? 'won' : 'lost';
      if (isDrawSelection) return home === away ? 'won' : 'lost';
    }

    // Goals Over/Under — market contains "goals", "over/under", or is "total goals"
    if (normalizedMarket.includes('goals') || normalizedMarket === 'over/under' || normalizedMarket.includes('total goals')) {
      if (!hasScore) return 'pending';
      const lineMatch = normalizedSelection.match(/(over|under)\s*(\d+(?:\.\d+)?)/);
      if (lineMatch) {
        const direction = lineMatch[1];
        const line = Number(lineMatch[2]);
        if (direction === 'over') return totalGoals > line ? 'won' : 'lost';
        return totalGoals < line ? 'won' : 'lost';
      }
      if (normalizedSelection.includes('over live goal line')) return totalGoals >= 3 ? 'won' : 'lost';
    }

    // BTTS (Both Teams to Score)
    if (normalizedMarket.includes('btts') || normalizedMarket.includes('both teams')) {
      if (!hasScore) return 'pending';
      const btts = home > 0 && away > 0;
      if (normalizedSelection === 'yes' || normalizedSelection.includes('sim')) return btts ? 'won' : 'lost';
      if (normalizedSelection === 'no' || normalizedSelection.includes('não') || normalizedSelection.includes('nao')) return !btts ? 'won' : 'lost';
    }

    // Double Chance
    if (normalizedMarket.includes('double chance') || normalizedMarket.includes('dupla')) {
      if (!hasScore) return 'pending';
      if (normalizedSelection === '1x' || normalizedSelection.includes('home or draw')) return home >= away ? 'won' : 'lost';
      if (normalizedSelection === 'x2' || normalizedSelection.includes('away or draw')) return away >= home ? 'won' : 'lost';
      if (normalizedSelection === '12' || normalizedSelection.includes('home or away')) return home !== away ? 'won' : 'lost';
    }

    // Draw No Bet
    if (normalizedMarket.includes('draw no bet') || normalizedMarket === 'dnb') {
      if (!hasScore) return 'pending';
      if (home === away) return 'void';
      if (normalizedSelection === 'home' || normalizedSelection === '1') return home > away ? 'won' : 'lost';
      if (normalizedSelection === 'away' || normalizedSelection === '2') return away > home ? 'won' : 'lost';
    }

    if (normalizedMarket.includes('corners')) {
      if (homeCorners === undefined || awayCorners === undefined) return 'pending';
      const totalCorners = homeCorners + awayCorners;
      const lineMatch = normalizedSelection.match(/(over|under)\s*(\d+(?:\.\d+)?)/);
      if (lineMatch) {
        const direction = lineMatch[1];
        const line = Number(lineMatch[2]);
        if (direction === 'over') return totalCorners > line ? 'won' : 'lost';
        return totalCorners < line ? 'won' : 'lost';
      }
      if (normalizedSelection.startsWith('home')) return homeCorners > awayCorners ? 'won' : 'lost';
      if (normalizedSelection.startsWith('away')) return awayCorners > homeCorners ? 'won' : 'lost';
    }

    if (normalizedMarket.includes('shots on target')) {
      if (homeSot === undefined || awaySot === undefined) return 'pending';
      const totalSot = homeSot + awaySot;
      const lineMatch = normalizedSelection.match(/(over|under)\s*(\d+(?:\.\d+)?)/);
      if (lineMatch) {
        const direction = lineMatch[1];
        const line = Number(lineMatch[2]);
        if (normalizedSelection.includes('home')) {
          return direction === 'over' ? (homeSot > line ? 'won' : 'lost') : (homeSot < line ? 'won' : 'lost');
        }
        if (normalizedSelection.includes('away')) {
          return direction === 'over' ? (awaySot > line ? 'won' : 'lost') : (awaySot < line ? 'won' : 'lost');
        }
        return direction === 'over' ? (totalSot > line ? 'won' : 'lost') : (totalSot < line ? 'won' : 'lost');
      }
      if (normalizedSelection.startsWith('home')) return homeSot > awaySot ? 'won' : 'lost';
      if (normalizedSelection.startsWith('away')) return awaySot > homeSot ? 'won' : 'lost';
    }

    return 'pending';
  }

  private async resolvePendingStatus(
    valueBet: ValueBetEntity,
    matchCache: Map<string, MatchEntity | null>,
  ): Promise<'pending' | 'won' | 'lost' | 'void'> {
    if (!valueBet.matchId) return 'pending';
    if (!matchCache.has(valueBet.matchId)) {
      const byMatchId = await this.matchesService.findByMatchId(valueBet.matchId);
      if (byMatchId) {
        matchCache.set(valueBet.matchId, byMatchId);
      } else {
        try {
          const byId = await this.matchesService.findById(valueBet.matchId);
          matchCache.set(valueBet.matchId, byId);
        } catch {
          matchCache.set(valueBet.matchId, null);
        }
      }
    }

    const match = matchCache.get(valueBet.matchId);
    if (!match) return 'pending';
    return this.evaluateValueBetResult(match, valueBet.market, valueBet.outcome);
  }

  async runSimulation(userId: string, dto: RunSimulationDto): Promise<SimulationEntity> {
    const simulation = await this.simulationsRepository.create({
      userId,
      name: dto.name,
      initialBankroll: dto.initialBankroll,
      currentBankroll: dto.initialBankroll,
      strategy: dto.strategy,
      flatStakeAmount: dto.flatStakeAmount,
      percentageStake: dto.percentageStake,
      kellyFraction: dto.kellyFraction ?? 0.5,
      minOdds: dto.minOdds,
      maxOdds: dto.maxOdds,
      minValue: dto.minValue,
      onlyHighValue: dto.onlyHighValue,
      projectPending: dto.projectPending ?? false,
      dateFrom: dto.dateFrom,
      dateTo: dto.dateTo,
      status: 'running',
      bets: [],
    });

    try {
      let allBets = await this.valueBetsRepository.findAll();
      const totalValueBets = allBets.length;

      const dateFrom = dto.dateFrom ? new Date(dto.dateFrom) : null;
      const dateTo = dto.dateTo ? new Date(dto.dateTo) : null;

      if (dateFrom) {
        dateFrom.setHours(0, 0, 0, 0);
      }
      if (dateTo) {
        dateTo.setHours(23, 59, 59, 999);
      }

      if (dateFrom || dateTo) {
        allBets = allBets.filter((b) => {
          if (!b.detectedAt) return false;
          const detectedAt = new Date(b.detectedAt).getTime();
          if (dateFrom && detectedAt < dateFrom.getTime()) return false;
          if (dateTo && detectedAt > dateTo.getTime()) return false;
          return true;
        });
      }
      const afterDateFilter = allBets.length;

      if (dto.minOdds) allBets = allBets.filter((b) => b.bookmakerOdds >= dto.minOdds);
      const afterMinOddsFilter = allBets.length;
      if (dto.maxOdds) allBets = allBets.filter((b) => b.bookmakerOdds <= dto.maxOdds);
      const afterMaxOddsFilter = allBets.length;
      if (dto.minValue) allBets = allBets.filter((b) => b.value >= dto.minValue);
      const afterMinValueFilter = allBets.length;
      if (dto.onlyHighValue) allBets = allBets.filter((b) => b.classification === 'HIGH');
      const afterHighValueFilter = allBets.length;

      if (allBets.length === 0) {
        await this.simulationsRepository.update(simulation.id, { status: 'failed' } as unknown);
        throw new BadRequestException(
          `No value bets matched filters. total=${totalValueBets}, afterDate=${afterDateFilter}, afterMinOdds=${afterMinOddsFilter}, afterMaxOdds=${afterMaxOddsFilter}, afterMinValue=${afterMinValueFilter}, afterHighValue=${afterHighValueFilter}`,
        );
      }

      const matchCache = new Map<string, MatchEntity | null>();
      const betOutcomes: Array<{ bet: ValueBetEntity; status: 'pending' | 'won' | 'lost' | 'void' }> = [];

      for (const valueBet of allBets) {
        let status = valueBet.status;
        if (status === 'pending') {
          status = await this.resolvePendingStatus(valueBet, matchCache);
        }

        if (status === 'won' || status === 'lost' || status === 'void' || status === 'pending') {
          betOutcomes.push({ bet: valueBet, status });
        }
      }

      // Simulate chronologically using real resolved outcomes instead of random sampling.
      betOutcomes.sort((a, b) => {
        const aTime = a.bet.detectedAt ? new Date(a.bet.detectedAt).getTime() : 0;
        const bTime = b.bet.detectedAt ? new Date(b.bet.detectedAt).getTime() : 0;
        return aTime - bTime;
      });

      let currentBankroll = dto.initialBankroll;
      const simulationBets: SimulationBetEntity[] = [];

      for (const row of betOutcomes) {
        const vb = row.bet;
        let stake: number;

        switch (dto.strategy) {
          case 'flat':
            stake = dto.flatStakeAmount ?? currentBankroll * 0.02;
            break;
          case 'percentage':
            stake = currentBankroll * ((dto.percentageStake ?? 2) / 100);
            break;
          case 'kelly':
          default: {
            const b = vb.bookmakerOdds - 1;
            const p = vb.modelProbability;
            const q = 1 - p;
            const kelly = b > 0 ? (b * p - q) / b : 0;
            const fraction = dto.kellyFraction ?? 0.5;
            stake = kelly > 0 ? Math.min(kelly * fraction * currentBankroll, 0.25 * currentBankroll) : 0;
          }
        }

        if (stake <= 0) continue;

        let betStatus: 'pending' | 'won' | 'lost' | 'void';
        let profit: number;

        if (row.status === 'won') {
          betStatus = 'won';
          profit = stake * (vb.bookmakerOdds - 1);
        } else if (row.status === 'lost') {
          betStatus = 'lost';
          profit = -stake;
        } else if (row.status === 'void') {
          betStatus = 'void';
          profit = 0;
        } else {
          // Keep pending opportunities in the simulation history.
          betStatus = 'pending';
          if (dto.projectPending) {
            const modelProbability = Math.min(1, Math.max(0, vb.modelProbability ?? 0));
            // Expected P/L for decimal odds: stake * (p * odds - 1)
            profit = stake * (modelProbability * vb.bookmakerOdds - 1);
          } else {
            profit = 0;
          }
        }

        if (betStatus === 'won' || betStatus === 'lost' || (betStatus === 'pending' && dto.projectPending)) {
          currentBankroll += profit;
        }

        simulationBets.push(
          Object.assign(new SimulationBetEntity(), {
            valueBetId: vb.id,
            matchId: vb.matchId,
            market: vb.market,
            outcome: vb.outcome,
            bookmaker: vb.bookmaker,
            odds: vb.bookmakerOdds,
            modelProbability: vb.modelProbability,
            value: vb.value,
            classification: vb.classification,
            stake,
            status: betStatus,
            profit,
            bankrollAfter: currentBankroll,
          }),
        );
      }

      const updated = await this.simulationsRepository.update(simulation.id, {
        currentBankroll,
        status: 'completed',
        bets: simulationBets as unknown,
      } as unknown);

      return updated;
    } catch (error) {
      await this.simulationsRepository.update(simulation.id, { status: 'failed' } as unknown);
      if (error instanceof Error) throw error;
      throw new Error('Simulation failed');
    }
  }

  async getSimulation(id: string, userId: string): Promise<SimulationEntity> {
    const sim = await this.simulationsRepository.findById(id);
    if (!sim || sim.userId !== userId) throw new NotFoundException('Simulation not found');
    return sim;
  }

  async getSimulationSummary(id: string, userId: string): Promise<Record<string, unknown>> {
    const owner = await this.simulationsRepository.findOwnerById(id);
    if (!owner || owner.userId !== userId) throw new NotFoundException('Simulation not found');

    const summary = await this.simulationsRepository.findSummaryById(id);
    if (!summary) throw new NotFoundException('Simulation not found');

    return summary;
  }

  async getSimulationBets(userId: string, id: string, page = 1, limit = 100) {
    const owner = await this.simulationsRepository.findOwnerById(id);
    if (!owner || owner.userId !== userId) throw new NotFoundException('Simulation not found');

    return this.simulationsRepository.findBetsBySimulationIdPaginated(id, page, limit);
  }

  async getUserSimulations(userId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));

    const [simulations, total] = await Promise.all([
      this.simulationsRepository.findByUserIdPaginatedSummary(userId, safePage, safeLimit),
      this.simulationsRepository.countByUserId(userId),
    ]);

    return {
      data: simulations,
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  buildChartData(simulation: SimulationEntity): { index: number; bankroll: number; profit: number; cumulativeProfit: number; stake: number; won: boolean }[] {
    if (!simulation.bets || simulation.bets.length === 0) {
      return [
        {
          index: 0,
          bankroll: simulation.initialBankroll,
          profit: 0,
          cumulativeProfit: 0,
          stake: 0,
          won: false,
        },
      ];
    }

    let cumProfit = 0;
    return simulation.bets.map((bet, index) => {
      cumProfit += bet.profit;
      return {
        index,
        bankroll: bet.bankrollAfter,
        profit: bet.profit,
        cumulativeProfit: cumProfit,
        stake: bet.stake,
        won: bet.status === 'won',
      };
    });
  }
}
