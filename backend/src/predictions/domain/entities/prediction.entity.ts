export class PredictionEntity {
  id: string;
  matchId: string;
  homeProbability: number;
  drawProbability: number;
  awayProbability: number;
  overProbability: number;
  underProbability: number;
  cornerOverProbability?: number;
  cornerUnderProbability?: number;
  confidence: number;
  models: string[];
  createdAt: Date;
}
