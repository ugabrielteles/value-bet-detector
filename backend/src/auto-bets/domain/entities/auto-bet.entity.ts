export type AutoBetStatus =
  | 'queued'    // detected, waiting to be placed
  | 'placing'   // automation is running
  | 'placed'    // bookmaker confirmed placement
  | 'won'       // outcome: won
  | 'lost'      // outcome: lost
  | 'void'      // outcome: void (match cancelled, etc.)
  | 'failed'    // automation error
  | 'skipped'   // blocked by stop-loss or settings
  | 'cancelled'; // manually cancelled

export class AutoBetEntity {
  id: string;
  userId: string;

  // Source value bet
  valueBetId: string;
  matchId: string;

  // Bet details
  bookmaker: string;
  bookmakerUrl?: string;
  market: string;
  outcome: string;
  bookmakerOdds: number;
  modelProbability: number;
  valueEdge: number; // % edge over implied probability

  // Stake decision
  stakeAmount: number;
  stakeStrategy: string; // snapshot of strategy used
  bankrollAtBet: number; // bankroll snapshot when bet queued

  // Execution
  status: AutoBetStatus;
  placedAt?: Date;
  betSlipId?: string; // confirmation ID scraped from bookmaker
  automationLog: string[];
  automationError?: string;

  // Outcome
  actualProfit?: number; // positive = win, negative = loss
  resolvedAt?: Date;

  createdAt: Date;
  updatedAt: Date;

  constructor(partial?: Partial<AutoBetEntity>) {
    this.automationLog = [];
    if (partial) Object.assign(this, partial);
  }

  get isFinal(): boolean {
    return ['won', 'lost', 'void', 'failed', 'skipped', 'cancelled'].includes(this.status);
  }

  get netProfit(): number {
    if (this.status === 'won') return (this.actualProfit ?? 0);
    if (this.status === 'lost') return -(this.stakeAmount ?? 0);
    return 0;
  }
}
