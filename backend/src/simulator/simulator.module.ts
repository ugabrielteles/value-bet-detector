import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SimulatorService } from './simulator.service';
import { SimulatorController } from './simulator.controller';
import { SimulationsRepository } from './infrastructure/repositories/simulations.repository';
import { Simulation, SimulationSchema } from './infrastructure/models/simulation.model';
import { ValueBetsRepository } from '../value-bets/infrastructure/repositories/value-bets.repository';
import { ValueBet, ValueBetSchema } from '../value-bets/infrastructure/models/value-bet.model';
import { MatchesModule } from '../matches/matches.module';

@Module({
  imports: [
    MatchesModule,
    MongooseModule.forFeature([
      { name: Simulation.name, schema: SimulationSchema },
      { name: ValueBet.name, schema: ValueBetSchema },
    ]),
  ],
  controllers: [SimulatorController],
  providers: [SimulatorService, SimulationsRepository, ValueBetsRepository],
  exports: [SimulatorService],
})
export class SimulatorModule {}
