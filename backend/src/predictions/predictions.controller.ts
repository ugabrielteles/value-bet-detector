import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { PredictionsService } from './predictions.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';

@Controller('predictions')
@UseGuards(JwtAuthGuard)
export class PredictionsController {
  constructor(private readonly predictionsService: PredictionsService) {}

  @Get(':matchId')
  async getPrediction(@Param('matchId') matchId: string) {
    return this.predictionsService.getPrediction(matchId);
  }

  @Post(':matchId/run')
  async runPrediction(@Param('matchId') matchId: string) {
    const input = {
      homeTeam: { attackStrength: 1.1, defenseStrength: 0.9, xG: 1.4 },
      awayTeam: { attackStrength: 0.9, defenseStrength: 1.1, xG: 1.1 },
    };
    return this.predictionsService.runAndSave(matchId, input);
  }
}
