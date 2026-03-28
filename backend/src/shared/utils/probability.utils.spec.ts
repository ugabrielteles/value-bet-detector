import { ProbabilityUtils } from './probability.utils';

describe('ProbabilityUtils', () => {
  describe('factorial', () => {
    it('should return 1 for 0', () => {
      expect(ProbabilityUtils.factorial(0)).toBe(1);
    });

    it('should return 1 for 1', () => {
      expect(ProbabilityUtils.factorial(1)).toBe(1);
    });

    it('should return 120 for 5', () => {
      expect(ProbabilityUtils.factorial(5)).toBe(120);
    });

    it('should throw for negative numbers', () => {
      expect(() => ProbabilityUtils.factorial(-1)).toThrow();
    });
  });

  describe('poissonProbability', () => {
    it('should compute P(X=0) for lambda=1', () => {
      const result = ProbabilityUtils.poissonProbability(1, 0);
      expect(result).toBeCloseTo(Math.exp(-1), 5);
    });

    it('should compute P(X=2) for lambda=2', () => {
      const result = ProbabilityUtils.poissonProbability(2, 2);
      expect(result).toBeCloseTo((4 * Math.exp(-2)) / 2, 5);
    });
  });

  describe('calculateMatchProbabilities', () => {
    it('should return probabilities summing close to 1', () => {
      const { home, draw, away } = ProbabilityUtils.calculateMatchProbabilities(1.5, 1.2);
      expect(home + draw + away).toBeCloseTo(1, 1);
    });

    it('should give higher home probability when home xG is much greater', () => {
      const { home, away } = ProbabilityUtils.calculateMatchProbabilities(3, 0.5);
      expect(home).toBeGreaterThan(away);
    });

    it('should give higher away probability when away xG is much greater', () => {
      const { home, away } = ProbabilityUtils.calculateMatchProbabilities(0.5, 3);
      expect(away).toBeGreaterThan(home);
    });
  });

  describe('calculateValueBet', () => {
    it('should return positive value when model prob > implied prob', () => {
      const value = ProbabilityUtils.calculateValueBet(0.5, 2.5);
      expect(value).toBeCloseTo(0.25, 5);
    });

    it('should return negative value when model prob < implied prob', () => {
      const value = ProbabilityUtils.calculateValueBet(0.3, 2.0);
      expect(value).toBeCloseTo(-0.4, 5);
    });
  });

  describe('classifyValue', () => {
    it('should classify >0.1 as HIGH', () => {
      expect(ProbabilityUtils.classifyValue(0.15)).toBe('HIGH');
    });

    it('should classify >=0.05 and <=0.1 as MEDIUM', () => {
      expect(ProbabilityUtils.classifyValue(0.07)).toBe('MEDIUM');
    });

    it('should classify <0.05 as LOW', () => {
      expect(ProbabilityUtils.classifyValue(0.02)).toBe('LOW');
    });
  });

  describe('impliedProbability', () => {
    it('should return 0.5 for odds of 2.0', () => {
      expect(ProbabilityUtils.impliedProbability(2.0)).toBeCloseTo(0.5, 5);
    });

    it('should return 0.25 for odds of 4.0', () => {
      expect(ProbabilityUtils.impliedProbability(4.0)).toBeCloseTo(0.25, 5);
    });
  });

  describe('isSteamMove', () => {
    it('should detect steam move when large change in short time', () => {
      expect(ProbabilityUtils.isSteamMove(2.0, 1.5, 3)).toBe(true);
    });

    it('should not detect steam move when change is small', () => {
      expect(ProbabilityUtils.isSteamMove(2.0, 2.05, 2)).toBe(false);
    });

    it('should not detect steam move when time is too long', () => {
      expect(ProbabilityUtils.isSteamMove(2.0, 1.5, 10)).toBe(false);
    });
  });
});
