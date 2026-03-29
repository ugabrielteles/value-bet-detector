import { Controller, Get, Post, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { PredictionsService } from './predictions.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { UserEntity } from '../auth/domain/entities/user.entity';

@Controller('predictions')
@UseGuards(JwtAuthGuard)
export class PredictionsController {
  constructor(private readonly predictionsService: PredictionsService) {}

  @Get('opportunities/today')
  async getTodayOpportunities(
    @Query('limit') limit?: string,
    @Query('leagueIds') leagueIds?: string,
    @Query('countries') countries?: string,
    @Query('internationalOnly') internationalOnly?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : 20;
    const parsedLeagueIds = leagueIds ? leagueIds.split(',') : undefined;
    const parsedCountries = countries ? countries.split(',') : undefined;
    const parsedInternationalOnly = internationalOnly === 'true';

    return this.predictionsService.getTodayOpportunitiesFiltered(
      Number.isFinite(parsedLimit) ? parsedLimit : 20,
      {
        leagueIds: parsedLeagueIds,
        countries: parsedCountries,
        internationalOnly: parsedInternationalOnly,
      },
    );
  }

  @Get('opportunities/live')
  async getLiveOpportunities(
    @Query('limit') limit?: string,
    @Query('leagueIds') leagueIds?: string,
    @Query('countries') countries?: string,
    @Query('internationalOnly') internationalOnly?: string,
  ) {
    const parsed = limit ? Number(limit) : 50;
    return this.predictionsService.getLiveOpportunities(Number.isFinite(parsed) ? parsed : 50, {
      leagueIds: leagueIds ? leagueIds.split(',') : undefined,
      countries: countries ? countries.split(',') : undefined,
      internationalOnly: internationalOnly === 'true',
    });
  }

  @Get('opportunities/stats')
  async getOpportunityStats() {
    return this.predictionsService.getOpportunityMarketStats();
  }

  @Post('opportunities/reconcile')
  async reconcileOpportunities(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 500;
    return this.predictionsService.reconcilePendingOpportunities(Number.isFinite(parsed) ? parsed : 500);
  }

  @Get(':matchId/opportunities/history')
  async getMatchOpportunityHistory(@Param('matchId') matchId: string, @Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 100;
    return this.predictionsService.getOpportunityHistory(matchId, Number.isFinite(parsed) ? parsed : 100);
  }

  @Get(':matchId')
  async getPrediction(@Param('matchId') matchId: string) {
    return this.predictionsService.getPrediction(matchId);
  }

  @Get(':matchId/opportunities')
  async getMatchOpportunities(@Param('matchId') matchId: string) {
    return this.predictionsService.getPredictionInsights(matchId);
  }

  @Post(':matchId/run')
  async runPrediction(@Param('matchId') matchId: string) {
    return this.predictionsService.runAndSaveForMatch(matchId);
  }

  @Post('recalculate/all')
  async recalculateAllPredictions(
    @CurrentUser() user: UserEntity,
    @Query('statuses') statuses?: string,
    @Query('limit') limit?: string,
  ) {
    const isAdmin = Array.isArray(user?.roles) && user.roles.includes('admin');
    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }

    const parsedStatuses = statuses
      ? statuses.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
      : ['scheduled', 'live'];
    const parsedLimit = limit ? Number(limit) : 1000;

    const allowedStatuses = new Set(['scheduled', 'live', 'finished', 'cancelled']);
    const normalizedStatuses = parsedStatuses.filter((s) => allowedStatuses.has(s));

    return this.predictionsService.recalculatePredictions({
      statuses: normalizedStatuses as Array<'scheduled' | 'live' | 'finished' | 'cancelled'>,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : 1000,
    });
  }
}
