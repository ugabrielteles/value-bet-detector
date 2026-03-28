import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
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

  private async withRetry<T>(fn: () => Promise<T>, retries = this.maxRetries): Promise<T> {
    let lastError: Error;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error: unknown) {
        lastError = error as Error;
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
    return this.withRetry(async () => {
      const response = await this.client.get('/fixtures', { params: { league: leagueId, date } });
      return response.data?.response ?? [];
    });
  }

  async fetchOdds(matchId: string): Promise<unknown[]> {
    return this.withRetry(async () => {
      const response = await this.client.get('/odds', { params: { fixture: matchId } });
      return response.data?.response ?? [];
    });
  }

  async fetchStatistics(matchId: string): Promise<unknown> {
    return this.withRetry(async () => {
      const response = await this.client.get('/fixtures/statistics', { params: { fixture: matchId } });
      return response.data?.response ?? {};
    });
  }
}
