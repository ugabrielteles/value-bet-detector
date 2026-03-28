import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ApiFootballAdapter } from './adapters/api-football.adapter';
import { MatchesService } from '../matches/matches.service';
import { OddsService } from '../odds/odds.service';
import { IngestionLogRepository } from './infrastructure/repositories/ingestion-log.repository';
import {
  IngestionProcessType,
  IngestionRunStatus,
  IngestionTriggerType,
} from './infrastructure/models/ingestion-log.model';

type MatchStatus = 'scheduled' | 'live' | 'finished' | 'cancelled';

export interface IngestionSummary {
  date: string;
  leagueId: string;
  fixturesFetched: number;
  matchesUpserted: number;
  oddsSaved: number;
  fixturesWithNoOdds: number;
  fallbackUsed: boolean;
  fallbackDate?: string;
  errors: string[];
}

interface FixtureBatch {
  date: string;
  fixtures: any[];
}

@Injectable()
export class DataIngestionService {
  private readonly logger = new Logger(DataIngestionService.name);
  private readonly defaultLeagueId = process.env.API_FOOTBALL_DEFAULT_LEAGUE_ID || '39';
  private readonly defaultWindowDays = Number(process.env.API_FOOTBALL_INGESTION_WINDOW_DAYS || '3');
  private readonly fallbackLookaheadDays = Number(process.env.API_FOOTBALL_FUTURE_LOOKAHEAD_DAYS || '14');

  constructor(
    private readonly apiFootballAdapter: ApiFootballAdapter,
    private readonly matchesService: MatchesService,
    private readonly oddsService: OddsService,
    private readonly ingestionLogRepository: IngestionLogRepository,
  ) {}

  private async persistRunLog(
    processType: IngestionProcessType,
    trigger: IngestionTriggerType,
    status: IngestionRunStatus,
    summary: IngestionSummary,
    startedAt: Date,
    finishedAt: Date,
    errorMessage?: string,
  ): Promise<void> {
    await this.ingestionLogRepository.create({
      processType,
      trigger,
      status,
      date: summary.date,
      leagueId: summary.leagueId,
      fixturesFetched: summary.fixturesFetched,
      matchesUpserted: summary.matchesUpserted,
      oddsSaved: summary.oddsSaved,
      fixturesWithNoOdds: summary.fixturesWithNoOdds,
      fallbackUsed: summary.fallbackUsed,
      fallbackDate: summary.fallbackDate,
      errorList: summary.errors,
      errorMessage,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    });
  }

  private getTodayIsoDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  private toIsoDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private getTargetDates(date?: string): string[] {
    if (date) return [date];

    const days = Number.isFinite(this.defaultWindowDays) ? Math.max(0, this.defaultWindowDays) : 3;
    const today = new Date();
    const dates: string[] = [];

    for (let offset = -days; offset <= days; offset += 1) {
      const target = new Date(today);
      target.setUTCDate(target.getUTCDate() + offset);
      dates.push(this.toIsoDate(target));
    }

    return dates;
  }

  private getSummaryDateLabel(dates: string[]): string {
    if (dates.length === 1) return dates[0];
    return `${dates[0]}..${dates[dates.length - 1]}`;
  }

  private addDays(baseDate: string, days: number): string {
    const target = new Date(`${baseDate}T00:00:00.000Z`);
    target.setUTCDate(target.getUTCDate() + days);
    return this.toIsoDate(target);
  }

  private async fetchFixturesBatch(leagueId: string, targetDate: string): Promise<FixtureBatch> {
    const fixtures = await this.apiFootballAdapter.fetchFixtures(leagueId, targetDate);
    return { date: targetDate, fixtures: fixtures as any[] };
  }

  private async findNextFutureBatchWithFixtures(leagueId: string, startDateExclusive: string): Promise<FixtureBatch | null> {
    const lookaheadDays = Number.isFinite(this.fallbackLookaheadDays)
      ? Math.max(1, this.fallbackLookaheadDays)
      : 14;

    for (let offset = 1; offset <= lookaheadDays; offset += 1) {
      const targetDate = this.addDays(startDateExclusive, offset);
      const batch = await this.fetchFixturesBatch(leagueId, targetDate);
      if (batch.fixtures.length > 0) {
        this.logger.log(`No fixtures in default window; using fallback date ${targetDate} with ${batch.fixtures.length} fixtures`);
        return batch;
      }
    }

    return null;
  }

  private async resolveFixtureBatches(leagueId: string, date?: string): Promise<FixtureBatch[]> {
    const targetDates = this.getTargetDates(date);
    const batches: FixtureBatch[] = [];

    for (const targetDate of targetDates) {
      batches.push(await this.fetchFixturesBatch(leagueId, targetDate));
    }

    if (date || batches.some((batch) => batch.fixtures.length > 0)) {
      return batches;
    }

    const fallbackBatch = await this.findNextFutureBatchWithFixtures(leagueId, targetDates[targetDates.length - 1]);
    return fallbackBatch ? [fallbackBatch] : batches;
  }

  private applyResolvedBatchMetadata(
    initialTargetDates: string[],
    batches: FixtureBatch[],
    summary: IngestionSummary,
  ): void {
    summary.date = this.getSummaryDateLabel(batches.map((batch) => batch.date));

    const initialLabel = this.getSummaryDateLabel(initialTargetDates);
    const fallbackBatch = batches.length === 1 && !initialTargetDates.includes(batches[0].date)
      ? batches[0]
      : null;

    summary.fallbackUsed = Boolean(fallbackBatch) && summary.date !== initialLabel;
    summary.fallbackDate = fallbackBatch?.date;
  }

  private async syncFixturesForDates(
    batches: FixtureBatch[],
    summary: IngestionSummary,
  ): Promise<void> {
    for (const batch of batches) {
      summary.fixturesFetched += batch.fixtures.length;

      for (const fixture of batch.fixtures as any[]) {
        try {
          const payload = this.extractMatchPayload(fixture);
          if (!payload) continue;

          const existing = await this.matchesService.findByMatchId(payload.matchId);
          if (existing) {
            await this.matchesService.update(existing.id, payload);
          } else {
            await this.matchesService.create(payload);
          }
          summary.matchesUpserted += 1;
        } catch (error: unknown) {
          summary.errors.push((error as Error).message);
        }
      }
    }
  }

  private async ingestOddsForDates(
    batches: FixtureBatch[],
    summary: IngestionSummary,
  ): Promise<void> {
    for (const batch of batches) {
      for (const fixture of batch.fixtures as any[]) {
        try {
          const fixtureId = fixture?.fixture?.id;
          if (!fixtureId) continue;

          const matchId = String(fixtureId);
          const oddsResponse = await this.apiFootballAdapter.fetchOdds(matchId);
          const oddsPayload = this.extractOddsPayload(matchId, oddsResponse as any[]);

          if (!oddsPayload) {
            summary.fixturesWithNoOdds += 1;
            continue;
          }

          await this.oddsService.saveOdds(oddsPayload);
          summary.oddsSaved += 1;
        } catch (error: unknown) {
          summary.errors.push((error as Error).message);
        }
      }
    }
  }

  private ensureApiKeyConfigured(): void {
    const key = process.env.API_FOOTBALL_KEY;
    if (!key || key === 'your-api-football-key-here') {
      throw new Error('API_FOOTBALL_KEY is not configured');
    }
  }

  private mapFixtureStatus(shortStatus?: string): MatchStatus {
    if (!shortStatus) return 'scheduled';
    if (['NS', 'TBD', 'PST'].includes(shortStatus)) return 'scheduled';
    if (['1H', '2H', 'HT', 'ET', 'BT', 'LIVE'].includes(shortStatus)) return 'live';
    if (['FT', 'AET', 'PEN'].includes(shortStatus)) return 'finished';
    if (['CANC', 'ABD', 'AWD', 'WO'].includes(shortStatus)) return 'cancelled';
    return 'scheduled';
  }

  private extractMatchPayload(fixture: any) {
    const fixtureId = fixture?.fixture?.id;
    if (!fixtureId) return null;

    const statusShort = fixture?.fixture?.status?.short as string | undefined;

    return {
      matchId: String(fixtureId),
      homeTeam: {
        id: String(fixture?.teams?.home?.id ?? ''),
        name: String(fixture?.teams?.home?.name ?? 'Home'),
        logo: fixture?.teams?.home?.logo,
      },
      awayTeam: {
        id: String(fixture?.teams?.away?.id ?? ''),
        name: String(fixture?.teams?.away?.name ?? 'Away'),
        logo: fixture?.teams?.away?.logo,
      },
      league: {
        id: String(fixture?.league?.id ?? ''),
        name: String(fixture?.league?.name ?? 'Unknown League'),
        country: fixture?.league?.country,
        logo: fixture?.league?.logo,
      },
      startTime: fixture?.fixture?.date ? new Date(fixture.fixture.date) : new Date(),
      status: this.mapFixtureStatus(statusShort),
      homeScore: Number(fixture?.goals?.home ?? 0),
      awayScore: Number(fixture?.goals?.away ?? 0),
    };
  }

  private extractOddsPayload(matchId: string, oddsResponse: any[]) {
    const bookmakers = oddsResponse?.[0]?.bookmakers;
    if (!Array.isArray(bookmakers) || bookmakers.length === 0) return null;

    for (const bookmaker of bookmakers) {
      const bets = bookmaker?.bets;
      if (!Array.isArray(bets)) continue;

      const matchWinner = bets.find((b: any) => {
        const name = String(b?.name ?? '').toLowerCase();
        return name.includes('match winner') || name.includes('1x2');
      });

      const values = matchWinner?.values;
      if (!Array.isArray(values)) continue;

      const home = values.find((v: any) => ['home', '1'].includes(String(v?.value ?? '').toLowerCase()));
      const draw = values.find((v: any) => ['draw', 'x'].includes(String(v?.value ?? '').toLowerCase()));
      const away = values.find((v: any) => ['away', '2'].includes(String(v?.value ?? '').toLowerCase()));

      const homeOdds = Number(home?.odd);
      const drawOdds = Number(draw?.odd);
      const awayOdds = Number(away?.odd);

      if (!homeOdds || !drawOdds || !awayOdds) continue;

      return {
        matchId,
        bookmaker: String(bookmaker?.name ?? 'Unknown'),
        market: '1X2',
        homeOdds,
        drawOdds,
        awayOdds,
      };
    }

    return null;
  }

  async runFixtureSync(
    leagueId = this.defaultLeagueId,
    date?: string,
    trigger: IngestionTriggerType = 'manual',
  ): Promise<IngestionSummary> {
    const startedAt = new Date();
    const initialTargetDates = this.getTargetDates(date);
    const summary: IngestionSummary = {
      date: this.getSummaryDateLabel(initialTargetDates),
      leagueId,
      fixturesFetched: 0,
      matchesUpserted: 0,
      oddsSaved: 0,
      fixturesWithNoOdds: 0,
      fallbackUsed: false,
      fallbackDate: undefined,
      errors: [],
    };

    let status: IngestionRunStatus = 'success';
    let processError: Error | undefined;

    try {
      this.ensureApiKeyConfigured();
      const batches = await this.resolveFixtureBatches(leagueId, date);
      this.applyResolvedBatchMetadata(initialTargetDates, batches, summary);

      await this.syncFixturesForDates(batches, summary);

      if (summary.errors.length > 0) {
        status = 'partial';
      }
    } catch (error: unknown) {
      processError = error as Error;
      summary.errors.push(processError.message);
      status = 'failed';
    }

    const finishedAt = new Date();
    await this.persistRunLog('fixtures', trigger, status, summary, startedAt, finishedAt, processError?.message);

    if (processError) {
      throw processError;
    }

    return summary;
  }

  async runOddsIngestion(
    leagueId = this.defaultLeagueId,
    date?: string,
    trigger: IngestionTriggerType = 'manual',
  ): Promise<IngestionSummary> {
    const startedAt = new Date();
    let status: IngestionRunStatus = 'success';
    let processError: Error | undefined;
    const initialTargetDates = this.getTargetDates(date);
    const summary: IngestionSummary = {
      date: this.getSummaryDateLabel(initialTargetDates),
      leagueId,
      fixturesFetched: 0,
      matchesUpserted: 0,
      oddsSaved: 0,
      fixturesWithNoOdds: 0,
      fallbackUsed: false,
      fallbackDate: undefined,
      errors: [],
    };

    try {
      this.ensureApiKeyConfigured();
      const batches = await this.resolveFixtureBatches(leagueId, date);
      this.applyResolvedBatchMetadata(initialTargetDates, batches, summary);

      await this.syncFixturesForDates(batches, summary);
      await this.ingestOddsForDates(batches, summary);

      if (summary.errors.length > 0) {
        status = 'partial';
      }
    } catch (error: unknown) {
      processError = error as Error;
      summary.errors.push(processError.message);
      status = 'failed';
    }

    const finishedAt = new Date();
    await this.persistRunLog('odds', trigger, status, summary, startedAt, finishedAt, processError?.message);

    if (processError) {
      throw processError;
    }

    return summary;
  }

  @Cron('0 */30 * * * *')
  async ingestOdds(): Promise<void> {
    this.logger.log('Starting scheduled odds ingestion');
    try {
      const summary = await this.runOddsIngestion(this.defaultLeagueId, undefined, 'cron');
      this.logger.log(
        `Odds ingestion done: fixtures=${summary.fixturesFetched}, matches=${summary.matchesUpserted}, odds=${summary.oddsSaved}, noOdds=${summary.fixturesWithNoOdds}, errors=${summary.errors.length}`,
      );
    } catch (error: unknown) {
      this.logger.error('Failed to ingest odds', (error as Error).message);
    }
  }

  @Cron('0 6 * * *')
  async syncFixtures(): Promise<void> {
    this.logger.log('Starting scheduled fixture sync');
    try {
      const summary = await this.runFixtureSync(this.defaultLeagueId, undefined, 'cron');
      this.logger.log(
        `Fixture sync done: fixtures=${summary.fixturesFetched}, matches=${summary.matchesUpserted}, errors=${summary.errors.length}`,
      );
    } catch (error: unknown) {
      this.logger.error('Failed to sync fixtures', (error as Error).message);
    }
  }
}
