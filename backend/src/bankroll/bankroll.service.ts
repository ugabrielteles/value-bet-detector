import { Injectable } from '@nestjs/common';
import { BankrollRepository } from './infrastructure/repositories/bankroll.repository';
import { BankrollEntity } from './domain/entities/bankroll.entity';
import { UpdateBankrollDto } from './application/dtos/update-bankroll.dto';

export interface StakeRecommendation {
  recommendedStake: number;
  recommendedStakePercentage: number;
  kellyStake: number;
  flatStake: number;
  percentageStake: number;
  isStopped: boolean;
  stopReason?: string;
}

@Injectable()
export class BankrollService {
  constructor(private readonly bankrollRepository: BankrollRepository) {}

  async getBankroll(userId: string): Promise<BankrollEntity> {
    const bankroll = await this.bankrollRepository.findByUserId(userId);
    if (!bankroll) {
      return new BankrollEntity({
        userId,
        initialBankroll: 1000,
        currentBankroll: 1000,
      });
    }
    return bankroll;
  }

  async updateBankroll(userId: string, dto: UpdateBankrollDto): Promise<BankrollEntity> {
    return this.bankrollRepository.upsert(userId, dto);
  }

  async applyBetResult(userId: string, profitLoss: number): Promise<BankrollEntity> {
    const bankroll = await this.getBankroll(userId);
    const newBankroll = bankroll.currentBankroll + profitLoss;
    return this.bankrollRepository.upsert(userId, { currentBankroll: newBankroll });
  }

  async getUsersWithAutoBetEnabled(): Promise<string[]> {
    return this.bankrollRepository.findUserIdsWithAutoBetEnabled();
  }

  calculateKellyStake(bankroll: BankrollEntity, modelProbability: number, decimalOdds: number): number {
    const b = decimalOdds - 1;
    const p = modelProbability;
    const q = 1 - p;
    const kelly = (b * p - q) / b;

    if (kelly <= 0) return 0;

    const scaledKelly = kelly * bankroll.kellyFraction;
    const minBet = (bankroll.minBetPercentage / 100) * bankroll.currentBankroll;
    const maxBet = (bankroll.maxBetPercentage / 100) * bankroll.currentBankroll;

    return Math.min(Math.max(scaledKelly * bankroll.currentBankroll, minBet), maxBet);
  }

  async getStakeRecommendation(
    userId: string,
    modelProbability: number,
    decimalOdds: number,
  ): Promise<StakeRecommendation> {
    const bankroll = await this.getBankroll(userId);

    if (bankroll.isStopped) {
      return {
        recommendedStake: 0,
        recommendedStakePercentage: 0,
        kellyStake: 0,
        flatStake: 0,
        percentageStake: 0,
        isStopped: true,
        stopReason: 'Stop-loss triggered',
      };
    }

    const kellyStake = this.calculateKellyStake(bankroll, modelProbability, decimalOdds);
    const flatStake = (bankroll.minBetPercentage / 100) * bankroll.currentBankroll;
    const percentageStake = ((bankroll.minBetPercentage + bankroll.maxBetPercentage) / 2 / 100) * bankroll.currentBankroll;

    let recommendedStake: number;
    switch (bankroll.strategy) {
      case 'flat':
        recommendedStake = flatStake;
        break;
      case 'percentage':
        recommendedStake = percentageStake;
        break;
      case 'kelly':
      default:
        recommendedStake = kellyStake;
    }

    return {
      recommendedStake,
      recommendedStakePercentage: (recommendedStake / bankroll.currentBankroll) * 100,
      kellyStake,
      flatStake,
      percentageStake,
      isStopped: false,
    };
  }
}
