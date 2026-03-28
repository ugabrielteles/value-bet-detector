import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';

@Controller('matches')
@UseGuards(JwtAuthGuard)
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  async findAll(@Query('status') status?: string, @Query('league') league?: string) {
    return this.matchesService.findAll({ status, league });
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.matchesService.findById(id);
  }

  @Get(':id/stats')
  async getStats(@Param('id') id: string) {
    const match = await this.matchesService.findById(id);
    return match.stats;
  }
}
