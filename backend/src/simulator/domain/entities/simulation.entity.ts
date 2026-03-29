export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed';
export type SimulationStrategy = 'flat' | 'kelly' | 'percentage';

export class SimulationBetEntity {
  valueBetId: string;
  matchId: string;
  market: string;
  outcome: string;
  bookmaker: string;
  odds: number;
  modelProbability: number;
  value: number;
  classification: string;
  stake: number;
  status: 'pending' | 'won' | 'lost' | 'void';
  profit: number;
  bankrollAfter: number;
}

export class SimulationEntity {
  id: string;
  userId: string;
  name: string;
  initialBankroll: number;
  currentBankroll: number;
  strategy: SimulationStrategy;
  flatStakeAmount?: number;
  percentageStake?: number;
  kellyFraction: number;
  minOdds?: number;
  maxOdds?: number;
  minValue?: number;
  onlyHighValue?: boolean;
  projectPending?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  status: SimulationStatus;
  bets: SimulationBetEntity[];
  createdAt: Date;
  updatedAt: Date;

  constructor(partial?: Partial<SimulationEntity>) {
    this.bets = [];
    this.strategy = 'kelly';
    this.kellyFraction = 0.5;
    this.status = 'pending';
    if (partial) Object.assign(this, partial);
  }

  get totalBets(): number {
    return this.bets.length;
  }

  get wonBets(): number {
    return this.bets.filter((b) => b.status === 'won').length;
  }

  get lostBets(): number {
    return this.bets.filter((b) => b.status === 'lost').length;
  }

  get totalStaked(): number {
    return this.bets.reduce((acc, b) => acc + b.stake, 0);
  }

  get totalProfit(): number {
    return this.bets.reduce((acc, b) => acc + b.profit, 0);
  }

  get roi(): number {
    if (!this.totalStaked) return 0;
    return (this.totalProfit / this.totalStaked) * 100;
  }

  get hitRate(): number {
    const settled = this.bets.filter((b) => b.status !== 'void').length;
    if (!settled) return 0;
    return (this.wonBets / settled) * 100;
  }

  get maxDrawdown(): number {
    let peak = this.initialBankroll;
    let maxDD = 0;
    let current = this.initialBankroll;
    for (const bet of this.bets) {
      current = bet.bankrollAfter;
      if (current > peak) peak = current;
      const dd = (peak - current) / peak;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD * 100;
  }
}
