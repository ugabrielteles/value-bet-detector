import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ValueBetsRepository } from './infrastructure/repositories/value-bets.repository';
import { ValueBetEntity, ValueBetStatus } from './domain/entities/value-bet.entity';
import { ProbabilityUtils } from '../shared/utils/probability.utils';
import { PredictionEntity } from '../predictions/domain/entities/prediction.entity';
import { OddsEntity } from '../odds/domain/entities/odds.entity';

@Injectable()
export class ValueBetsService {
  private readonly logger = new Logger(ValueBetsService.name);

  constructor(private readonly valueBetsRepository: ValueBetsRepository) {}

  async detectAndSave(prediction: PredictionEntity, odds: OddsEntity, matchExpiresAt?: Date): Promise<ValueBetEntity[]> {
    const markets = [
      { outcome: 'home', modelProbability: prediction.homeProbability, bookmakerOdds: odds.homeOdds },
      { outcome: 'draw', modelProbability: prediction.drawProbability, bookmakerOdds: odds.drawOdds },
      { outcome: 'away', modelProbability: prediction.awayProbability, bookmakerOdds: odds.awayOdds },
    ];

    const bets: ValueBetEntity[] = [];

    for (const market of markets) {
      const value = ProbabilityUtils.calculateValueBet(market.modelProbability, market.bookmakerOdds);
      if (value > 0) {
        const classification = ProbabilityUtils.classifyValue(value);
        const impliedProbability = ProbabilityUtils.impliedProbability(market.bookmakerOdds);
        const bet = await this.valueBetsRepository.create({
          matchId: prediction.matchId,
          predictionId: prediction.id,
          bookmaker: odds.bookmaker,
          market: '1X2',
          outcome: market.outcome,
          modelProbability: market.modelProbability,
          bookmakerOdds: market.bookmakerOdds,
          impliedProbability,
          value,
          classification,
          isActive: true,
          detectedAt: new Date(),
          expiresAt: matchExpiresAt,
          status: 'pending',
          stakeAmount: 0,
          profit: 0,
        });
        bets.push(bet);
      }
    }

    return bets;
  }

  async findActive(page = 1, limit = 20): Promise<{ data: ValueBetEntity[]; total: number }> {
    return this.valueBetsRepository.findActive(page, limit);
  }

  async findByClassification(classification: string): Promise<ValueBetEntity[]> {
    return this.valueBetsRepository.findByClassification(classification);
  }

  async findByMatch(matchId: string): Promise<ValueBetEntity[]> {
    return this.valueBetsRepository.findByMatch(matchId);
  }

  async resolveValueBet(id: string, status: ValueBetStatus, stakeAmount: number): Promise<ValueBetEntity> {
    const bet = await this.valueBetsRepository.findById(id);
    if (!bet) throw new NotFoundException('Value bet not found');

    let profit = 0;
    if (status === 'won') {
      profit = stakeAmount * (bet.bookmakerOdds - 1);
    } else if (status === 'lost') {
      profit = -stakeAmount;
    }

    const updated = await this.valueBetsRepository.update(id, {
      status,
      stakeAmount,
      profit,
      isActive: false,
      resolvedAt: new Date(),
    } as unknown);

    if (!updated) throw new NotFoundException('Value bet not found');
    return updated;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupExpired(): Promise<void> {
    this.logger.log('Cleaning up expired value bets');
    await this.valueBetsRepository.deactivateExpired();
  }
}
