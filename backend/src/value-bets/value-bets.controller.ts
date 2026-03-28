import { Controller, Get, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ValueBetsService } from './value-bets.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { ValueBetStatus } from './domain/entities/value-bet.entity';

@Controller('value-bets')
@UseGuards(JwtAuthGuard)
export class ValueBetsController {
  constructor(private readonly valueBetsService: ValueBetsService) {}

  @Get()
  async findActive(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.valueBetsService.findActive(+page, +limit);
  }

  @Get('classification/:c')
  async findByClassification(@Param('c') classification: string) {
    return this.valueBetsService.findByClassification(classification);
  }

  @Get('match/:matchId')
  async findByMatch(@Param('matchId') matchId: string) {
    return this.valueBetsService.findByMatch(matchId);
  }

  @Patch(':id/resolve')
  async resolve(
    @Param('id') id: string,
    @Body('status') status: ValueBetStatus,
    @Body('stakeAmount') stakeAmount: number,
  ) {
    return this.valueBetsService.resolveValueBet(id, status, stakeAmount);
  }
}
