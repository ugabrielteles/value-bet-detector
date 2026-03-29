import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios';
import { BookmakerAdapter } from './bookmaker-adapter.interface';

@Injectable()
export class ApiFootballAdapter implements BookmakerAdapter {
  private readonly logger = new Logger(ApiFootballAdapter.name);
  private readonly client: AxiosInstance;
  private readonly maxRetries = 3;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://v3.football.api-sports.io',
      headers: {
        'x-apisports-key': process.env.API_FOOTBALL_KEY || '',
      },
    });
  }

  private logSuccess(endpoint: string, params: Record<string, string>, response: AxiosResponse): void {
    const results = Number(response.data?.results ?? 0);
    const errors = response.data?.errors;
    this.logger.log(
      `[${endpoint}] status=${response.status} params=${JSON.stringify(params)} results=${results} errors=${JSON.stringify(errors ?? null)}`,
    );
  }

  private ensureApiPayloadIsValid(endpoint: string, response: AxiosResponse): void {
    const errors = response.data?.errors;
    if (errors && typeof errors === 'object' && Object.keys(errors).length > 0) {
      throw new Error(`[${endpoint}] ${JSON.stringify(errors)}`);
    }
  }

  /**
   * International (national-team) leagues use the calendar year as season
   * identifier, not the football-year convention used by club leagues.
   * Add any new international league IDs from API-Football here.
   */
  private static readonly CALENDAR_YEAR_LEAGUES = new Set([
    '1',   // World Cup
    '5',   // UEFA Nations League
    '6',   // Euro Championship
    '9',   // Copa America
    '10',  // World Cup Qualifiers – UEFA
    '11',  // World Cup Qualifiers – CONMEBOL
    '29',  // World Cup Qualifiers – AFC
    '30',  // World Cup Qualifiers – CAF
    '31',  // World Cup Qualifiers – CONCACAF
    '32',  // World Cup Qualifiers – OFC
    '667', // International Friendlies
    '669', // International Friendlies (Women)
  ]);

  private deriveSeason(date: string, leagueId?: string): string {
    const [yearString, monthString] = date.split('-');
    const year = Number(yearString);
    const month = Number(monthString);

    if (!year || !month) {
      return String(new Date().getFullYear());
    }

    // International leagues are keyed by calendar year, not football season year
    if (leagueId && ApiFootballAdapter.CALENDAR_YEAR_LEAGUES.has(leagueId)) {
      return String(year);
    }

    return String(month >= 7 ? year : year - 1);
  }

  private logFailure(endpoint: string, params: Record<string, string>, error: unknown, attempt: number): void {
    const axiosError = error as AxiosError<{ errors?: unknown; message?: string }>;
    const status = axiosError.response?.status ?? 'no-status';
    const responseErrors = axiosError.response?.data?.errors;
    const responseMessage = axiosError.response?.data?.message;

    this.logger.warn(
      `[${endpoint}] attempt=${attempt + 1} failed status=${status} params=${JSON.stringify(params)} message=${responseMessage ?? axiosError.message} errors=${JSON.stringify(responseErrors ?? null)}`,
    );
  }

  private async withRetry<T>(
    endpoint: string,
    params: Record<string, string>,
    fn: () => Promise<T>,
    retries = this.maxRetries,
  ): Promise<T> {
    let lastError: Error;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error: unknown) {
        lastError = error as Error;
        this.logFailure(endpoint, params, error, attempt);
        const axiosError = error as { response?: { status: number } };
        if (axiosError?.response?.status === 429) {
          const waitMs = Math.pow(2, attempt) * 1000;
          this.logger.warn(`Rate limited. Waiting ${waitMs}ms before retry ${attempt + 1}`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        } else if (attempt < retries) {
          const waitMs = Math.pow(2, attempt) * 500;
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }
    }
    throw lastError;
  }

  /**
   * Returns all fixtures that are currently in progress (live=all).
   * Used to keep match statuses up to date without waiting for the
   * full 30-minute odds ingestion cycle.
   */
  async fetchLiveFixtures(): Promise<unknown[]> {
    const params: Record<string, string> = { live: 'all' };
    return this.withRetry('/fixtures', params, async () => {
      const response = await this.client.get('/fixtures', { params });
      this.ensureApiPayloadIsValid('/fixtures', response);
      this.logSuccess('/fixtures', params, response);
      return response.data?.response ?? [];
    });
  }

  async fetchFixtures(leagueId: string, date: string): Promise<unknown[]> {
    const params = { league: leagueId, date, season: this.deriveSeason(date, leagueId) };
    return this.withRetry('/fixtures', params, async () => {
      const response = await this.client.get('/fixtures', { params });
      this.ensureApiPayloadIsValid('/fixtures', response);
      this.logSuccess('/fixtures', params, response);
      return response.data?.response ?? [];
    });
  }

  /**
   * Fetches all fixtures worldwide for a given date (no league filter).
   * API-Football currently rejects the "page" param on /fixtures, so this
   * uses a single date query and returns whatever the API responds for that day.
   */
  async fetchFixturesByDate(date: string): Promise<unknown[]> {
    const params: Record<string, string> = { date };
    return this.withRetry('/fixtures', params, async () => {
      const response = await this.client.get('/fixtures', { params });
      this.ensureApiPayloadIsValid('/fixtures', response);
      this.logSuccess('/fixtures', params, response);
      return response.data?.response ?? [];
    });
  }

  /**
   * Returns all leagues that currently have ongoing or upcoming fixtures.
   * Useful for dynamically discovering all leagues for global ingestion.
   * Results are paged; this method collects all pages.
   */
  async fetchLeagues(season: number): Promise<{ id: number; name: string; country: string }[]> {
    const leagues: { id: number; name: string; country: string }[] = [];
    let page = 1;

    while (true) {
      const params: Record<string, string> = { current: 'true', season: String(season), page: String(page) };
      const results = await this.withRetry('/leagues', params, async () => {
        const response = await this.client.get('/leagues', { params });
        this.ensureApiPayloadIsValid('/leagues', response);
        this.logSuccess('/leagues', params, response);
        return response.data as { response: unknown[]; paging?: { current: number; total: number } };
      });

      const items: any[] = (results as any).response ?? [];
      for (const item of items) {
        const leagueId = item?.league?.id;
        const leagueName = item?.league?.name;
        const country = item?.country?.name;
        if (leagueId) {
          leagues.push({ id: Number(leagueId), name: String(leagueName ?? ''), country: String(country ?? '') });
        }
      }

      const paging = (results as any).paging;
      if (!paging || paging.current >= paging.total || items.length === 0) break;

      page += 1;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return leagues;
  }

  async fetchOdds(matchId: string): Promise<unknown[]> {
    const params = { fixture: matchId };
    return this.withRetry('/odds', params, async () => {
      const response = await this.client.get('/odds', { params });
      this.ensureApiPayloadIsValid('/odds', response);
      this.logSuccess('/odds', params, response);
      return response.data?.response ?? [];
    });
  }

  async fetchStatistics(matchId: string): Promise<unknown> {
    const params = { fixture: matchId };
    return this.withRetry('/fixtures/statistics', params, async () => {
      const response = await this.client.get('/fixtures/statistics', { params });
      this.ensureApiPayloadIsValid('/fixtures/statistics', response);
      this.logSuccess('/fixtures/statistics', params, response);
      return response.data?.response ?? {};
    });
  }
}
