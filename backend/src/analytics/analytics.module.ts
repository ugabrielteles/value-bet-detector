import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsRepository } from './infrastructure/repositories/analytics.repository';
import { ValueBet, ValueBetSchema } from '../value-bets/infrastructure/models/value-bet.model';

@Module({
  imports: [MongooseModule.forFeature([{ name: ValueBet.name, schema: ValueBetSchema }])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsRepository],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
