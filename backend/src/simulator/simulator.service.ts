import { Injectable, NotFoundException } from '@nestjs/common';
import { SimulationsRepository } from './infrastructure/repositories/simulations.repository';
import { ValueBetsRepository } from '../value-bets/infrastructure/repositories/value-bets.repository';
import { SimulationEntity, SimulationBetEntity } from './domain/entities/simulation.entity';
import { RunSimulationDto } from './application/dtos/run-simulation.dto';

@Injectable()
export class SimulatorService {
  constructor(
    private readonly simulationsRepository: SimulationsRepository,
    private readonly valueBetsRepository: ValueBetsRepository,
  ) {}

  async runSimulation(userId: string, dto: RunSimulationDto): Promise<SimulationEntity> {
    const simulation = await this.simulationsRepository.create({
      userId,
      name: dto.name,
      initialBankroll: dto.initialBankroll,
      currentBankroll: dto.initialBankroll,
      strategy: dto.strategy,
      flatStakeAmount: dto.flatStakeAmount,
      percentageStake: dto.percentageStake,
      kellyFraction: dto.kellyFraction ?? 0.5,
      minOdds: dto.minOdds,
      maxOdds: dto.maxOdds,
      minValue: dto.minValue,
      onlyHighValue: dto.onlyHighValue,
      dateFrom: dto.dateFrom,
      dateTo: dto.dateTo,
      status: 'running',
      bets: [],
    });

    try {
      let allBets = await this.valueBetsRepository.findAll();

      if (dto.minOdds) allBets = allBets.filter((b) => b.bookmakerOdds >= dto.minOdds);
      if (dto.maxOdds) allBets = allBets.filter((b) => b.bookmakerOdds <= dto.maxOdds);
      if (dto.minValue) allBets = allBets.filter((b) => b.value >= dto.minValue);
      if (dto.onlyHighValue) allBets = allBets.filter((b) => b.classification === 'HIGH');

      let currentBankroll = dto.initialBankroll;
      const simulationBets: SimulationBetEntity[] = [];

      for (const vb of allBets) {
        let stake: number;

        switch (dto.strategy) {
          case 'flat':
            stake = dto.flatStakeAmount ?? currentBankroll * 0.02;
            break;
          case 'percentage':
            stake = currentBankroll * ((dto.percentageStake ?? 2) / 100);
            break;
          case 'kelly':
          default: {
            const b = vb.bookmakerOdds - 1;
            const p = vb.modelProbability;
            const q = 1 - p;
            const kelly = b > 0 ? (b * p - q) / b : 0;
            const fraction = dto.kellyFraction ?? 0.5;
            stake = kelly > 0 ? Math.min(kelly * fraction * currentBankroll, 0.25 * currentBankroll) : 0;
          }
        }

        if (stake <= 0) continue;

        const voided = Math.random() < 0.01;
        let betStatus: 'won' | 'lost' | 'void';
        let profit: number;

        if (voided) {
          betStatus = 'void';
          profit = 0;
        } else {
          const won = Math.random() < vb.modelProbability;
          betStatus = won ? 'won' : 'lost';
          profit = won ? stake * (vb.bookmakerOdds - 1) : -stake;
        }

        if (!voided) currentBankroll += profit;

        simulationBets.push(
          Object.assign(new SimulationBetEntity(), {
            valueBetId: vb.id,
            matchId: vb.matchId,
            market: vb.market,
            outcome: vb.outcome,
            bookmaker: vb.bookmaker,
            odds: vb.bookmakerOdds,
            modelProbability: vb.modelProbability,
            value: vb.value,
            classification: vb.classification,
            stake,
            status: betStatus,
            profit,
            bankrollAfter: currentBankroll,
          }),
        );
      }

      const updated = await this.simulationsRepository.update(simulation.id, {
        currentBankroll,
        status: 'completed',
        bets: simulationBets as unknown,
      } as unknown);

      return updated;
    } catch {
      await this.simulationsRepository.update(simulation.id, { status: 'failed' } as unknown);
      throw new Error('Simulation failed');
    }
  }

  async getSimulation(id: string, userId: string): Promise<SimulationEntity> {
    const sim = await this.simulationsRepository.findById(id);
    if (!sim || sim.userId !== userId) throw new NotFoundException('Simulation not found');
    return sim;
  }

  async getUserSimulations(userId: string): Promise<SimulationEntity[]> {
    return this.simulationsRepository.findByUserId(userId);
  }

  buildChartData(simulation: SimulationEntity): { index: number; bankroll: number; profit: number; cumulativeProfit: number; stake: number; won: boolean }[] {
    let cumProfit = 0;
    return simulation.bets.map((bet, index) => {
      cumProfit += bet.profit;
      return {
        index,
        bankroll: bet.bankrollAfter,
        profit: bet.profit,
        cumulativeProfit: cumProfit,
        stake: bet.stake,
        won: bet.status === 'won',
      };
    });
  }
}
