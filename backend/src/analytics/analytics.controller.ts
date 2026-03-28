import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  async getSummary() {
    return this.analyticsService.getSummary();
  }

  @Get('daily-performance')
  async getDailyPerformance(@Query('days') days = 30) {
    return this.analyticsService.getDailyPerformance(+days);
  }

  @Get('performance-by-category')
  async getPerformanceByCategory() {
    return this.analyticsService.getPerformanceByCategory();
  }

  @Get('performance-by-market')
  async getPerformanceByMarket() {
    return this.analyticsService.getPerformanceByMarket();
  }
}
