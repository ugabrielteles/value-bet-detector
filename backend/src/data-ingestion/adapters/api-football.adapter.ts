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

  private deriveSeason(date: string): string {
    const [yearString, monthString] = date.split('-');
    const year = Number(yearString);
    const month = Number(monthString);

    if (!year || !month) {
      return String(new Date().getFullYear());
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

  async fetchFixtures(leagueId: string, date: string): Promise<unknown[]> {
    const params = { league: leagueId, date, season: this.deriveSeason(date) };
    return this.withRetry('/fixtures', params, async () => {
      const response = await this.client.get('/fixtures', { params });
      this.ensureApiPayloadIsValid('/fixtures', response);
      this.logSuccess('/fixtures', params, response);
      return response.data?.response ?? [];
    });
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
