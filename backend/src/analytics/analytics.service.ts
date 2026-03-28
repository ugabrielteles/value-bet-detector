import { Injectable } from '@nestjs/common';
import {
  AnalyticsRepository,
  AnalyticsSummary,
  DailyPerformance,
  PerformanceByCategory,
  PerformanceByMarket,
} from './infrastructure/repositories/analytics.repository';

@Injectable()
export class AnalyticsService {
  constructor(private readonly analyticsRepository: AnalyticsRepository) {}

  async getSummary(): Promise<AnalyticsSummary> {
    return this.analyticsRepository.getSummary();
  }

  async getDailyPerformance(days = 30): Promise<DailyPerformance[]> {
    return this.analyticsRepository.getDailyPerformance(days);
  }

  async getPerformanceByCategory(): Promise<PerformanceByCategory[]> {
    return this.analyticsRepository.getPerformanceByCategory();
  }

  async getPerformanceByMarket(): Promise<PerformanceByMarket[]> {
    return this.analyticsRepository.getPerformanceByMarket();
  }
}
