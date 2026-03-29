import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AutoBetsController } from './auto-bets.controller';
import { AutoBetsService } from './auto-bets.service';
import { AutoBetsRepository } from './infrastructure/repositories/auto-bets.repository';
import { AutoBet, AutoBetSchema } from './infrastructure/models/auto-bet.model';
import { BankrollModule } from '../bankroll/bankroll.module';
import { BetAutomationModule } from '../bet-automation/bet-automation.module';
import { ValueBetsModule } from '../value-bets/value-bets.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AutoBet.name, schema: AutoBetSchema }]),
    BankrollModule,
    BetAutomationModule,
    ValueBetsModule,
  ],
  controllers: [AutoBetsController],
  providers: [AutoBetsService, AutoBetsRepository],
  exports: [AutoBetsService],
})
export class AutoBetsModule {}
