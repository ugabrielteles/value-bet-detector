import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { UserEntity } from '../auth/domain/entities/user.entity';
import { AutoBetsService } from './auto-bets.service';
import { UpdateAutoOutcomeDto } from './application/dtos/update-auto-outcome.dto';
import { AutoBetStatus } from './domain/entities/auto-bet.entity';

@Controller('auto-bets')
@UseGuards(JwtAuthGuard)
export class AutoBetsController {
  constructor(private readonly service: AutoBetsService) {}

  /** List auto-bets with optional status filter and pagination */
  @Get()
  list(
    @CurrentUser() user: UserEntity,
    @Query('status') status?: AutoBetStatus | 'all',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getList(user.id, {
      status: status ?? 'all',
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
    });
  }

  /** Aggregated analytics for auto-bets */
  @Get('analytics')
  getAnalytics(@CurrentUser() user: UserEntity) {
    return this.service.getAnalytics(user.id);
  }

  /** Execute all queued bets for the authenticated user */
  @Post('execute-all')
  executeAll(
    @CurrentUser() user: UserEntity,
    @Query('includeFailed') includeFailed?: string,
  ) {
    return this.service.executeAllQueuedForUser(user.id, {
      includeFailed: includeFailed === 'true',
    });
  }

  /** Execute a single queued bet */
  @Post(':id/execute')
  execute(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.service.executeBet(user.id, id);
  }

  /** Cancel a queued bet */
  @Patch(':id/cancel')
  cancel(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.service.cancelBet(user.id, id);
  }

  /** Update outcome for a placed bet (won / lost / void) */
  @Patch(':id/outcome')
  updateOutcome(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: UpdateAutoOutcomeDto,
  ) {
    return this.service.updateOutcome(user.id, id, dto);
  }
}
