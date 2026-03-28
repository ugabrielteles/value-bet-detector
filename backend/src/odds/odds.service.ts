import { Injectable } from '@nestjs/common';
import { OddsRepository } from './infrastructure/repositories/odds.repository';
import { OddsEntity } from './domain/entities/odds.entity';
import { ProbabilityUtils } from '../shared/utils/probability.utils';

@Injectable()
export class OddsService {
  constructor(private readonly oddsRepository: OddsRepository) {}

  async saveOdds(data: Partial<OddsEntity>): Promise<OddsEntity> {
    const latest = await this.oddsRepository.getLatest(data.matchId);
    if (latest) {
      const isSteam = ProbabilityUtils.isSteamMove(latest.homeOdds, data.homeOdds, 3);
      data.isSteamMove = isSteam;
      data.previousOdds = latest.homeOdds;
    }
    return this.oddsRepository.save(data);
  }

  async getLatestOdds(matchId: string): Promise<OddsEntity | null> {
    return this.oddsRepository.getLatest(matchId);
  }

  async getOddsHistory(matchId: string): Promise<OddsEntity[]> {
    return this.oddsRepository.getHistory(matchId);
  }

  async detectSteamMoves(matchId: string): Promise<OddsEntity[]> {
    return this.oddsRepository.getSteamMoves(matchId);
  }

  async getSteamAlerts(matchId: string): Promise<OddsEntity[]> {
    return this.oddsRepository.getSteamMoves(matchId);
  }
}
