import { Module } from '@nestjs/common';
import { DataIngestionService } from './data-ingestion.service';
import { ApiFootballAdapter } from './adapters/api-football.adapter';

@Module({
  providers: [DataIngestionService, ApiFootballAdapter],
  exports: [DataIngestionService],
})
export class DataIngestionModule {}
