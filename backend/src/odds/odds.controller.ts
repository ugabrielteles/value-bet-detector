import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { OddsService } from './odds.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';

@Controller('odds')
@UseGuards(JwtAuthGuard)
export class OddsController {
  constructor(private readonly oddsService: OddsService) {}

  @Get(':matchId')
  async getLatest(@Param('matchId') matchId: string) {
    return this.oddsService.getLatestOdds(matchId);
  }

  @Get(':matchId/history')
  async getHistory(@Param('matchId') matchId: string) {
    return this.oddsService.getOddsHistory(matchId);
  }

  @Get(':matchId/steam-alerts')
  async getSteamAlerts(@Param('matchId') matchId: string) {
    return this.oddsService.getSteamAlerts(matchId);
  }
}
