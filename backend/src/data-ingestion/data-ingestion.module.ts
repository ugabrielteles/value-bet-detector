import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DataIngestionService } from './data-ingestion.service';
import { ApiFootballAdapter } from './adapters/api-football.adapter';
import { DataIngestionController } from './data-ingestion.controller';
import { MatchesModule } from '../matches/matches.module';
import { OddsModule } from '../odds/odds.module';
import { IngestionLog, IngestionLogSchema } from './infrastructure/models/ingestion-log.model';
import { IngestionLogRepository } from './infrastructure/repositories/ingestion-log.repository';

@Module({
  imports: [
    MatchesModule,
    OddsModule,
    MongooseModule.forFeature([{ name: IngestionLog.name, schema: IngestionLogSchema }]),
  ],
  controllers: [DataIngestionController],
  providers: [DataIngestionService, ApiFootballAdapter, IngestionLogRepository],
  exports: [DataIngestionService],
})
export class DataIngestionModule {}
