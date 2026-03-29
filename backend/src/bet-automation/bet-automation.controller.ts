import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { UserEntity } from '../auth/domain/entities/user.entity';
import { BetAutomationService } from './bet-automation.service';
import { RunBetanoBetDto } from './application/dtos/run-betano-bet.dto';
import { RunBookmakerAutomationDto } from './application/dtos/run-bookmaker-automation.dto';

@Controller('bet-automation')
@UseGuards(JwtAuthGuard)
export class BetAutomationController {
  constructor(private readonly service: BetAutomationService) {}

  @Get('providers')
  listProviders(@CurrentUser() user: UserEntity) {
    return this.service.listProviders(user.id);
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
