import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { UserEntity } from '../auth/domain/entities/user.entity';
import { BetAutomationService } from './bet-automation.service';
import { RunBetanoBetDto } from './application/dtos/run-betano-bet.dto';
import { RunBookmakerAutomationDto } from './application/dtos/run-bookmaker-automation.dto';
import { StartManualSessionDto } from './application/dtos/start-manual-session.dto';

@Controller('bet-automation')
@UseGuards(JwtAuthGuard)
export class BetAutomationController {
  constructor(private readonly service: BetAutomationService) {}

  @Get('providers')
  listProviders(@CurrentUser() user: UserEntity) {
    return this.service.listProviders(user.id);
  }

  @Get('session-status/:provider')
  getSessionStatus(@CurrentUser() user: UserEntity, @Param('provider') provider: 'betano' | 'bet365') {
    return this.service.getSessionStatus(user.id, provider);
  }

  @Post('manual-session/start')
  startManualSession(@CurrentUser() user: UserEntity, @Body() dto: StartManualSessionDto) {
    return this.service.startManualSession(user.id, dto.provider);
  }

  @Post('manual-session/:sessionId/complete')
  completeManualSession(@CurrentUser() user: UserEntity, @Param('sessionId') sessionId: string) {
    return this.service.completeManualSession(user.id, sessionId);
  }

  @Delete('session-profile/:provider')
  clearSavedSession(@CurrentUser() user: UserEntity, @Param('provider') provider: 'betano' | 'bet365') {
    return this.service.clearSavedSession(user.id, provider);
  }

  @Post('run')
  run(@CurrentUser() user: UserEntity, @Body() dto: RunBookmakerAutomationDto) {
    return this.service.run(user.id, dto);
  }

  @Post('betano/run')
  runBetano(@CurrentUser() user: UserEntity, @Body() dto: RunBetanoBetDto) {
    return this.service.runBetano(user.id, dto);
  }
}
