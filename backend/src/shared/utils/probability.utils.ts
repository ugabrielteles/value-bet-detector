export class ProbabilityUtils {
  static factorial(n: number): number {
    if (n < 0) throw new Error('Factorial not defined for negative numbers');
    let result = 1;
    for (let i = 2; i <= n; i++) {
      result *= i;
    }
    return result;
  }

  static poissonProbability(lambda: number, k: number): number {
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / ProbabilityUtils.factorial(k);
  }

  static calculateMatchProbabilities(
    homeExpectedGoals: number,
    awayExpectedGoals: number,
    maxGoals = 6,
  ): { home: number; draw: number; away: number } {
    let home = 0;
    let draw = 0;
    let away = 0;

    for (let i = 0; i <= maxGoals; i++) {
      for (let j = 0; j <= maxGoals; j++) {
        const prob =
          ProbabilityUtils.poissonProbability(homeExpectedGoals, i) *
          ProbabilityUtils.poissonProbability(awayExpectedGoals, j);
        if (i > j) home += prob;
        else if (i === j) draw += prob;
        else away += prob;
      }
    }

    return { home, draw, away };
  }

  static calculateValueBet(modelProbability: number, decimalOdds: number): number {
    return modelProbability * decimalOdds - 1;
  }

  static classifyValue(value: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (value > 0.1) return 'HIGH';
    if (value >= 0.05) return 'MEDIUM';
    return 'LOW';
  }

  static impliedProbability(decimalOdds: number): number {
    return 1 / decimalOdds;
  }

  static isSteamMove(oldOdds: number, newOdds: number, minutesElapsed: number): boolean {
    const change = Math.abs(newOdds - oldOdds) / oldOdds;
    return change > 0.1 && minutesElapsed < 5;
  }
}
