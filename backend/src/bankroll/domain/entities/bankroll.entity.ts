export type BankrollStrategy = 'flat' | 'kelly' | 'percentage';

export class BankrollEntity {
  id: string;
  userId: string;
  initialBankroll: number;
  currentBankroll: number;
  minBetPercentage: number;
  maxBetPercentage: number;
  strategy: BankrollStrategy;
  useKellyCriterion: boolean;
  kellyFraction: number;
  stopLossEnabled: boolean;
  stopLossPercentage: number;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial?: Partial<BankrollEntity>) {
    this.minBetPercentage = 1;
    this.maxBetPercentage = 5;
    this.strategy = 'kelly';
    this.useKellyCriterion = true;
    this.kellyFraction = 0.5;
    this.stopLossEnabled = false;
    this.stopLossPercentage = 20;
    this.currency = 'USD';
    this.isActive = true;
    if (partial) Object.assign(this, partial);
  }

  get profitLoss(): number {
    return this.currentBankroll - this.initialBankroll;
  }

  get roi(): number {
    if (!this.initialBankroll) return 0;
    return (this.profitLoss / this.initialBankroll) * 100;
  }

  get drawdown(): number {
    if (!this.initialBankroll) return 0;
    return (this.initialBankroll - this.currentBankroll) / this.initialBankroll;
  }

  get isStopped(): boolean {
    return this.stopLossEnabled && this.drawdown >= this.stopLossPercentage / 100;
  }
}
