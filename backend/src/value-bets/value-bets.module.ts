import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ValueBetsService } from './value-bets.service';
import { ValueBetsController } from './value-bets.controller';
import { ValueBetsRepository } from './infrastructure/repositories/value-bets.repository';
import { ValueBet, ValueBetSchema } from './infrastructure/models/value-bet.model';

@Module({
  imports: [MongooseModule.forFeature([{ name: ValueBet.name, schema: ValueBetSchema }])],
  controllers: [ValueBetsController],
  providers: [ValueBetsService, ValueBetsRepository],
  exports: [ValueBetsService],
})
export class ValueBetsModule {}
