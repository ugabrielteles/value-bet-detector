import { Controller, DefaultValuePipe, Get, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { DataIngestionService } from './data-ingestion.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { IngestionLogRepository } from './infrastructure/repositories/ingestion-log.repository';
import {
  IngestionProcessType,
  IngestionRunStatus,
  IngestionTriggerType,
} from './infrastructure/models/ingestion-log.model';

@Controller('data-ingestion')
@UseGuards(JwtAuthGuard)
export class DataIngestionController {
  constructor(
    private readonly dataIngestionService: DataIngestionService,
    private readonly ingestionLogRepository: IngestionLogRepository,
  ) {}

  @Get('logs')
  async getLogs(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('processType') processType?: IngestionProcessType,
    @Query('trigger') trigger?: IngestionTriggerType,
    @Query('status') status?: IngestionRunStatus,
    @Query('fallbackUsed') fallbackUsed?: string,
  ) {
    return this.ingestionLogRepository.findLatest({
      limit,
      processType,
      trigger,
      status,
      fallbackUsed: fallbackUsed === undefined ? undefined : fallbackUsed === 'true',
    });
  }

  @Post('run-fixtures')
  async runFixtureSync(
    @Query('leagueId') leagueId?: string,
    @Query('date') date?: string,
  ) {
    return this.dataIngestionService.runFixtureSync(leagueId, date);
  }

  @Post('run-odds')
  async runOddsIngestion(
    @Query('leagueId') leagueId?: string,
    @Query('date') date?: string,
  ) {
    return this.dataIngestionService.runOddsIngestion(leagueId, date);
  }

  @Post('run-all-leagues')
  async runAllLeagues(@Query('date') date?: string) {
    return this.dataIngestionService.runAllLeagues(date);
  }
}