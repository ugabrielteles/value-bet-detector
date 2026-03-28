export type ValueClassification = 'HIGH' | 'MEDIUM' | 'LOW';
export type ValueBetStatus = 'pending' | 'won' | 'lost' | 'void';

export class ValueBetEntity {
  id: string;
  matchId: string;
  predictionId: string;
  bookmaker: string;
  market: string;
  outcome: string;
  modelProbability: number;
  bookmakerOdds: number;
  impliedProbability: number;
  value: number;
  classification: ValueClassification;
  isActive: boolean;
  detectedAt: Date;
  expiresAt?: Date;
  status: ValueBetStatus;
  stakeAmount: number;
  profit: number;
  resolvedAt?: Date;
}
