import { IPredictionModel, PredictionInput, PredictionResult } from '../../domain/interfaces/prediction-model.interface';

export class LogisticRegressionModel implements IPredictionModel {
  predict(input: PredictionInput): PredictionResult {
    const homeLast5 = input.homeTeam.last5 ?? [];
    const awayLast5 = input.awayTeam.last5 ?? [];

    const homeFormScore = homeLast5.reduce((acc, r) => acc + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0) / (homeLast5.length * 3 || 1);
    const awayFormScore = awayLast5.reduce((acc, r) => acc + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0) / (awayLast5.length * 3 || 1);

    const homeXGScore = Math.min((input.homeTeam.xG ?? 1.2) / 2.5, 1);
    const awayXGScore = Math.min((input.awayTeam.xG ?? 1.0) / 2.5, 1);

    const h2h = input.h2h ?? { homeWins: 1, draws: 1, awayWins: 1 };
    const totalH2H = h2h.homeWins + h2h.draws + h2h.awayWins || 1;
    const homeH2H = h2h.homeWins / totalH2H;
    const awayH2H = h2h.awayWins / totalH2H;

    const homePosScore = 1 - (input.homeTeam.leaguePosition ?? 10) / 20;
    const awayPosScore = 1 - (input.awayTeam.leaguePosition ?? 10) / 20;

    const homeScore = 0.3 * homeFormScore + 0.3 * homeXGScore + 0.2 * homeH2H + 0.2 * homePosScore;
    const awayScore = 0.3 * awayFormScore + 0.3 * awayXGScore + 0.2 * awayH2H + 0.2 * awayPosScore;

    const total = homeScore + awayScore + 0.25;
    const homeProbability = homeScore / total;
    const awayProbability = awayScore / total;
    const drawProbability = 1 - homeProbability - awayProbability;

    return {
      homeProbability: Math.max(homeProbability, 0),
      drawProbability: Math.max(drawProbability, 0),
      awayProbability: Math.max(awayProbability, 0),
      overProbability: 0.52,
      underProbability: 0.48,
      confidence: 0.65,
    };
  }
}
