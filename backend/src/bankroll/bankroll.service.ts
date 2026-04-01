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

  private normalizeProviderKey(provider?: string): string | null {
    const normalized = String(provider || '').trim().toLowerCase();
    if (!normalized) return null;
    if (normalized.includes('betano')) return 'betano';
    if (normalized.includes('bet365')) return 'bet365';
    if (normalized.includes('betfair')) return 'betfair';
    if (normalized.includes('bwin')) return 'bwin';
    if (normalized.includes('unibet')) return 'unibet';
    return normalized;
  }

  private getProviderBalance(bankroll: BankrollEntity, provider?: string): number {
    const key = this.normalizeProviderKey(provider);
    if (!key) return bankroll.currentBankroll;
    const value = bankroll.providerBalances?.[key];
    return typeof value === 'number' ? value : bankroll.currentBankroll;
  }

  async getBankroll(userId: string): Promise<BankrollEntity> {
    const bankroll = await this.bankrollRepository.findByUserId(userId);
    if (!bankroll) {
      return new BankrollEntity({
        userId,
        initialBankroll: 1000,
        currentBankroll: 1000,
        currency: 'BRL',
      });
    }
    return bankroll;
  }

  async updateBankroll(userId: string, dto: UpdateBankrollDto): Promise<BankrollEntity> {
    const current = await this.bankrollRepository.findByUserId(userId);

    const payload: Partial<BankrollEntity> = { ...dto };
    const nextCurrentBankroll = typeof dto.currentBankroll === 'number'
      ? dto.currentBankroll
      : undefined;
    const nextInitialBankroll = typeof dto.initialBankroll === 'number'
      ? dto.initialBankroll
      : undefined;

    // The settings UI exposes a single bankroll amount, so a manual bankroll update
    // should not leave stale per-provider balances that would keep stake sizing anchored
    // to an old amount such as 1000.
    if (nextCurrentBankroll !== undefined || nextInitialBankroll !== undefined) {
      const fallbackBankroll = nextCurrentBankroll ?? nextInitialBankroll ?? current?.currentBankroll ?? 0;
      const existingProviderBalances = current?.providerBalances ?? {};
      const providerBalances = Object.keys(existingProviderBalances).reduce<Record<string, number>>((acc, key) => {
        acc[key] = fallbackBankroll;
        return acc;
      }, {});

      payload.currentBankroll = fallbackBankroll;
      payload.providerBalances = providerBalances;
    }

    return this.bankrollRepository.upsert(userId, payload);
  }

  async applyBetResult(userId: string, profitLoss: number, provider?: string): Promise<BankrollEntity> {
    const bankroll = await this.getBankroll(userId);
    const newBankroll = bankroll.currentBankroll + profitLoss;
    const providerKey = this.normalizeProviderKey(provider);
    const providerBalances = { ...(bankroll.providerBalances ?? {}) };

    if (providerKey) {
      const base = typeof providerBalances[providerKey] === 'number'
        ? providerBalances[providerKey]
        : bankroll.currentBankroll;
      providerBalances[providerKey] = base + profitLoss;
    }

    return this.bankrollRepository.upsert(userId, {
      currentBankroll: newBankroll,
      providerBalances,
    });
  }

  async syncProviderBalance(userId: string, provider: string, balance: number): Promise<BankrollEntity> {
    const bankroll = await this.getBankroll(userId);
    const providerKey = this.normalizeProviderKey(provider);
    if (!providerKey) return bankroll;

    const providerBalances = { ...(bankroll.providerBalances ?? {}), [providerKey]: balance };
    // Also update currentBankroll to keep it in sync when this is the configured provider
    const configuredProvider = this.normalizeProviderKey(bankroll.autoBetProvider);
    const updateCurrentBankroll = configuredProvider === providerKey;

    return this.bankrollRepository.upsert(userId, {
      providerBalances,
      ...(updateCurrentBankroll ? { currentBankroll: balance } : {}),
    });
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
    const minPct = Math.min(bankroll.minBetPercentage, bankroll.maxBetPercentage);
    const maxPct = Math.max(bankroll.minBetPercentage, bankroll.maxBetPercentage);
    const minBet = (minPct / 100) * bankroll.currentBankroll;
    const maxBet = (maxPct / 100) * bankroll.currentBankroll;

    return Math.min(Math.max(scaledKelly * bankroll.currentBankroll, minBet), maxBet);
  }

  async getStakeRecommendation(
    userId: string,
    modelProbability: number,
    decimalOdds: number,
    provider?: string,
  ): Promise<StakeRecommendation> {
    const bankroll = await this.getBankroll(userId);
    const effectiveBankroll = this.getProviderBalance(bankroll, provider);
    const bankrollScope = new BankrollEntity({
      ...bankroll,
      currentBankroll: effectiveBankroll,
    });

    if (bankrollScope.isStopped) {
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

    const minPct = Math.min(bankrollScope.minBetPercentage, bankrollScope.maxBetPercentage);
    const kellyStake = this.calculateKellyStake(bankrollScope, modelProbability, decimalOdds);
    const flatStake = (minPct / 100) * bankrollScope.currentBankroll;
    // Percentage mode should be predictable: use configured minimum percentage.
    const percentageStake = (minPct / 100) * bankrollScope.currentBankroll;

    let recommendedStake: number;
    switch (bankrollScope.strategy) {
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
      recommendedStakePercentage: bankrollScope.currentBankroll > 0
        ? (recommendedStake / bankrollScope.currentBankroll) * 100
        : 0,
      kellyStake,
      flatStake,
      percentageStake,
      isStopped: false,
    };
  }
}
