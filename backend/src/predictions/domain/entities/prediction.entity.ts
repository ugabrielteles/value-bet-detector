export class PredictionEntity {
  id: string;
  matchId: string;
  homeProbability: number;
  drawProbability: number;
  awayProbability: number;
  overProbability: number;
  underProbability: number;
  confidence: number;
  models: string[];
  createdAt: Date;
}
