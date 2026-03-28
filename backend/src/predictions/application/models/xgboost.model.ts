import { IPredictionModel, PredictionInput, PredictionResult } from '../../domain/interfaces/prediction-model.interface';

export class XGBoostModel implements IPredictionModel {
  predict(input: PredictionInput): PredictionResult {
    const homeLast5 = input.homeTeam.last5 ?? [];
    const awayLast5 = input.awayTeam.last5 ?? [];

    const homeForm = homeLast5.reduce((acc, r) => acc + (r === 'W' ? 1 : r === 'D' ? 0.4 : 0), 0) / (homeLast5.length || 1);
    const awayForm = awayLast5.reduce((acc, r) => acc + (r === 'W' ? 1 : r === 'D' ? 0.4 : 0), 0) / (awayLast5.length || 1);

    const homeXG = input.homeTeam.xG ?? 1.2;
    const awayXG = input.awayTeam.xG ?? 1.0;

    const oddsMovement = input.currentOdds
      ? (1 / input.currentOdds.home - 0.4) * 0.1
      : 0;

    const homeScore = homeForm * 0.4 + (homeXG / 2.5) * 0.4 + oddsMovement + 0.1;
    const awayScore = awayForm * 0.4 + (awayXG / 2.5) * 0.4 - oddsMovement;

    const total = homeScore + awayScore + 0.3;
    const homeProbability = Math.max(homeScore / total, 0.05);
    const awayProbability = Math.max(awayScore / total, 0.05);
    const drawProbability = Math.max(1 - homeProbability - awayProbability, 0.05);

    const norm = homeProbability + drawProbability + awayProbability;

    return {
      homeProbability: homeProbability / norm,
      drawProbability: drawProbability / norm,
      awayProbability: awayProbability / norm,
      overProbability: 0.55,
      underProbability: 0.45,
      confidence: 0.75,
    };
  }
}
