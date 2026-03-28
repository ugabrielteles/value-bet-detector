import { BankrollService } from './bankroll.service';
import { BankrollEntity } from './domain/entities/bankroll.entity';

const mockRepository = {
  findByUserId: jest.fn(),
  upsert: jest.fn(),
};

describe('BankrollService', () => {
  let service: BankrollService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BankrollService(mockRepository as never);
  });

  // BankrollEntity computed properties
  describe('BankrollEntity', () => {
    it('should compute profitLoss correctly', () => {
      const entity = new BankrollEntity({ initialBankroll: 1000, currentBankroll: 1200 });
      expect(entity.profitLoss).toBe(200);
    });

    it('should compute roi correctly', () => {
      const entity = new BankrollEntity({ initialBankroll: 1000, currentBankroll: 1100 });
      expect(entity.roi).toBeCloseTo(10, 5);
    });

    it('should return isStopped false when stop-loss not enabled', () => {
      const entity = new BankrollEntity({
        initialBankroll: 1000,
        currentBankroll: 700,
        stopLossEnabled: false,
        stopLossPercentage: 20,
      });
      expect(entity.isStopped).toBe(false);
    });

    it('should return isStopped true when drawdown exceeds stop-loss percentage', () => {
      const entity = new BankrollEntity({
        initialBankroll: 1000,
        currentBankroll: 750,
        stopLossEnabled: true,
        stopLossPercentage: 20,
      });
      expect(entity.isStopped).toBe(true);
    });
  });

  // calculateKellyStake tests
  describe('calculateKellyStake', () => {
    it('should return 0 when kelly is negative', () => {
      const bankroll = new BankrollEntity({
        currentBankroll: 1000,
        minBetPercentage: 1,
        maxBetPercentage: 5,
        kellyFraction: 0.5,
      });
      // odds 1.5, prob 0.3: kelly = (0.5 * 0.3 - 0.7) / 0.5 = (0.15 - 0.7) / 0.5 < 0
      const stake = service.calculateKellyStake(bankroll, 0.3, 1.5);
      expect(stake).toBe(0);
    });

    it('should return positive stake for positive kelly', () => {
      const bankroll = new BankrollEntity({
        currentBankroll: 1000,
        minBetPercentage: 1,
        maxBetPercentage: 5,
        kellyFraction: 0.5,
      });
      const stake = service.calculateKellyStake(bankroll, 0.6, 2.5);
      expect(stake).toBeGreaterThan(0);
    });

    it('should cap at maxBetPercentage', () => {
      const bankroll = new BankrollEntity({
        currentBankroll: 1000,
        minBetPercentage: 1,
        maxBetPercentage: 5,
        kellyFraction: 1,
      });
      // Very high probability, should cap at 5% = 50
      const stake = service.calculateKellyStake(bankroll, 0.99, 10.0);
      expect(stake).toBeLessThanOrEqual(50);
    });

    it('should have minBet floor when kelly result is below min', () => {
      const bankroll = new BankrollEntity({
        currentBankroll: 1000,
        minBetPercentage: 2,
        maxBetPercentage: 5,
        kellyFraction: 0.01,
      });
      // tiny kelly fraction should still return at least minBet = 20
      const stake = service.calculateKellyStake(bankroll, 0.55, 2.0);
      expect(stake).toBeGreaterThanOrEqual(20);
    });

    it('should apply half-kelly correctly', () => {
      const bankroll = new BankrollEntity({
        currentBankroll: 1000,
        minBetPercentage: 1,
        maxBetPercentage: 50,
        kellyFraction: 0.5,
      });
      const fullBankroll = new BankrollEntity({
        currentBankroll: 1000,
        minBetPercentage: 1,
        maxBetPercentage: 50,
        kellyFraction: 1.0,
      });
      const halfStake = service.calculateKellyStake(bankroll, 0.6, 2.0);
      const fullStake = service.calculateKellyStake(fullBankroll, 0.6, 2.0);
      expect(halfStake).toBeCloseTo(fullStake / 2, 1);
    });
  });

  // getStakeRecommendation tests
  describe('getStakeRecommendation', () => {
    it('should return isStopped with zero stakes when stop-loss triggered', async () => {
      const stoppedBankroll = new BankrollEntity({
        userId: 'user1',
        initialBankroll: 1000,
        currentBankroll: 750,
        stopLossEnabled: true,
        stopLossPercentage: 20,
        strategy: 'kelly',
        kellyFraction: 0.5,
        minBetPercentage: 1,
        maxBetPercentage: 5,
      });
      mockRepository.findByUserId.mockResolvedValue(stoppedBankroll);

      const result = await service.getStakeRecommendation('user1', 0.6, 2.5);
      expect(result.isStopped).toBe(true);
      expect(result.recommendedStake).toBe(0);
      expect(result.stopReason).toBeDefined();
    });

    it('should use flatStake for flat strategy', async () => {
      const bankroll = new BankrollEntity({
        userId: 'user1',
        initialBankroll: 1000,
        currentBankroll: 1000,
        strategy: 'flat',
        stopLossEnabled: false,
        minBetPercentage: 2,
        maxBetPercentage: 5,
        kellyFraction: 0.5,
      });
      mockRepository.findByUserId.mockResolvedValue(bankroll);

      const result = await service.getStakeRecommendation('user1', 0.6, 2.5);
      expect(result.isStopped).toBe(false);
      expect(result.recommendedStake).toBe(result.flatStake);
    });

    it('should use kellyStake for kelly strategy', async () => {
      const bankroll = new BankrollEntity({
        userId: 'user1',
        initialBankroll: 1000,
        currentBankroll: 1000,
        strategy: 'kelly',
        stopLossEnabled: false,
        minBetPercentage: 1,
        maxBetPercentage: 5,
        kellyFraction: 0.5,
      });
      mockRepository.findByUserId.mockResolvedValue(bankroll);

      const result = await service.getStakeRecommendation('user1', 0.6, 2.5);
      expect(result.isStopped).toBe(false);
      expect(result.recommendedStake).toBe(result.kellyStake);
    });

    it('should use percentageStake for percentage strategy', async () => {
      const bankroll = new BankrollEntity({
        userId: 'user1',
        initialBankroll: 1000,
        currentBankroll: 1000,
        strategy: 'percentage',
        stopLossEnabled: false,
        minBetPercentage: 2,
        maxBetPercentage: 4,
        kellyFraction: 0.5,
      });
      mockRepository.findByUserId.mockResolvedValue(bankroll);

      const result = await service.getStakeRecommendation('user1', 0.6, 2.5);
      expect(result.isStopped).toBe(false);
      expect(result.recommendedStake).toBe(result.percentageStake);
    });
  });
});
