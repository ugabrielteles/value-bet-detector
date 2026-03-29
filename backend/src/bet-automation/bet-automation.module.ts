import { Module } from '@nestjs/common';
import { BetAutomationController } from './bet-automation.controller';
import { BetAutomationService } from './bet-automation.service';
import { BookmakerCredentialsModule } from '../bookmaker-credentials/bookmaker-credentials.module';

@Module({
  imports: [BookmakerCredentialsModule],
  controllers: [BetAutomationController],
  providers: [BetAutomationService],
  exports: [BetAutomationService],
})
export class BetAutomationModule {}
