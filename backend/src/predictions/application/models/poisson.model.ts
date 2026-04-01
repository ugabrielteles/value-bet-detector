import { IPredictionModel, PredictionInput, PredictionResult } from '../../domain/interfaces/prediction-model.interface';
import { ProbabilityUtils } from '../../../shared/utils/probability.utils';

export class PoissonModel implements IPredictionModel {
  private readonly homeAdvantage = 1.1;

  predict(input: PredictionInput): PredictionResult {
    const homeAttack = input.homeTeam.attackStrength ?? 1.0;
    const homeDefense = input.homeTeam.defenseStrength ?? 1.0;
    const awayAttack = input.awayTeam.attackStrength ?? 1.0;
    const awayDefense = input.awayTeam.defenseStrength ?? 1.0;

    const homeXG = homeAttack * awayDefense * this.homeAdvantage;
    const awayXG = awayAttack * homeDefense;

    const { home, draw, away } = ProbabilityUtils.calculateMatchProbabilities(homeXG, awayXG);

    // Over/under 2.5 goals using Poisson
    let overProb = 0;
    const maxGoals = 10;
    for (let i = 0; i <= maxGoals; i++) {
      for (let j = 0; j <= maxGoals; j++) {
        if (i + j > 2.5) {
          overProb +=
            ProbabilityUtils.poissonProbability(homeXG, i) *
            ProbabilityUtils.poissonProbability(awayXG, j);
        }
      }
    }

    // Corners Over/Under 9.5 using Poisson approximation
    // Expected corners derived from XG: each XG unit generates ~1.6 corners, baseline ~5.5 per team
    const homeExpectedCorners = 5.5 + homeXG * 1.6;
    const awayExpectedCorners = 5.5 + awayXG * 1.6;
    const totalExpectedCorners = homeExpectedCorners + awayExpectedCorners;
    let cornerOverProb = 0;
    const maxCorners = 30;
    for (let c = 0; c <= maxCorners; c++) {
      if (c > 9.5) {
        cornerOverProb += ProbabilityUtils.poissonProbability(totalExpectedCorners, c);
      }
    }
    const cornerOverProbability = Math.min(Math.max(cornerOverProb, 0), 1);

    return {
      homeProbability: home,
      drawProbability: draw,
      awayProbability: away,
      overProbability: Math.min(overProb, 1),
      underProbability: Math.max(1 - overProb, 0),
      confidence: 0.7,
      cornerOverProbability,
      cornerUnderProbability: Math.max(1 - cornerOverProbability, 0),
    };
  }
}
