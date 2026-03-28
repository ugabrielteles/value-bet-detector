import { PoissonModel } from './poisson.model';

describe('PoissonModel', () => {
  let model: PoissonModel;

  beforeEach(() => {
    model = new PoissonModel();
  });

  it('should return probabilities summing to ~1', () => {
    const result = model.predict({
      homeTeam: { attackStrength: 1.2, defenseStrength: 0.9 },
      awayTeam: { attackStrength: 0.8, defenseStrength: 1.1 },
    });
    const sum = result.homeProbability + result.drawProbability + result.awayProbability;
    expect(sum).toBeCloseTo(1, 1);
  });

  it('should give home team higher probability with strong home attack', () => {
    const result = model.predict({
      homeTeam: { attackStrength: 2.5, defenseStrength: 0.5 },
      awayTeam: { attackStrength: 0.5, defenseStrength: 2.0 },
    });
    expect(result.homeProbability).toBeGreaterThan(result.awayProbability);
  });

  it('should give away team higher probability with strong away attack', () => {
    const result = model.predict({
      homeTeam: { attackStrength: 0.5, defenseStrength: 2.0 },
      awayTeam: { attackStrength: 3.0, defenseStrength: 0.5 },
    });
    expect(result.awayProbability).toBeGreaterThan(result.homeProbability);
  });

  it('should return over and under probabilities summing to ~1', () => {
    const result = model.predict({
      homeTeam: { attackStrength: 1.0, defenseStrength: 1.0 },
      awayTeam: { attackStrength: 1.0, defenseStrength: 1.0 },
    });
    expect(result.overProbability + result.underProbability).toBeCloseTo(1, 1);
  });

  it('should handle default values when no team stats provided', () => {
    const result = model.predict({
      homeTeam: {},
      awayTeam: {},
    });
    expect(result.homeProbability).toBeGreaterThan(0);
    expect(result.drawProbability).toBeGreaterThan(0);
    expect(result.awayProbability).toBeGreaterThan(0);
    expect(result.confidence).toBe(0.7);
  });

  it('should give home advantage effect', () => {
    const symmetric = model.predict({
      homeTeam: { attackStrength: 1.0, defenseStrength: 1.0 },
      awayTeam: { attackStrength: 1.0, defenseStrength: 1.0 },
    });
    expect(symmetric.homeProbability).toBeGreaterThan(symmetric.awayProbability);
  });
});
