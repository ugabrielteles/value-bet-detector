import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ApiFootballAdapter } from './adapters/api-football.adapter';

@Injectable()
export class DataIngestionService {
  private readonly logger = new Logger(DataIngestionService.name);

  constructor(private readonly apiFootballAdapter: ApiFootballAdapter) {}

  @Cron('0 */30 * * * *')
  async ingestOdds(): Promise<void> {
    this.logger.log('Starting odds ingestion');
    try {
      const today = new Date().toISOString().split('T')[0];
      const fixtures = await this.apiFootballAdapter.fetchFixtures('39', today);
      this.logger.log(`Fetched ${fixtures.length} fixtures for odds ingestion`);
    } catch (error: unknown) {
      this.logger.error('Failed to ingest odds', (error as Error).message);
    }
  }

  @Cron('0 6 * * *')
  async syncFixtures(): Promise<void> {
    this.logger.log('Starting fixture sync');
    try {
      const today = new Date().toISOString().split('T')[0];
      const fixtures = await this.apiFootballAdapter.fetchFixtures('39', today);
      this.logger.log(`Synced ${fixtures.length} fixtures`);
    } catch (error: unknown) {
      this.logger.error('Failed to sync fixtures', (error as Error).message);
    }
  }
}
