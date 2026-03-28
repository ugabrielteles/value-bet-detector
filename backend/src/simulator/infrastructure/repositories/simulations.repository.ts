import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Simulation, SimulationDocument } from '../models/simulation.model';
import { SimulationEntity, SimulationBetEntity } from '../../domain/entities/simulation.entity';

@Injectable()
export class SimulationsRepository {
  constructor(
    @InjectModel(Simulation.name)
    private readonly simulationModel: Model<SimulationDocument>,
  ) {}

  private toEntity(doc: SimulationDocument): SimulationEntity {
    return new SimulationEntity({
      id: doc._id.toString(),
      userId: doc.userId,
      name: doc.name,
      initialBankroll: doc.initialBankroll,
      currentBankroll: doc.currentBankroll,
      strategy: doc.strategy as SimulationEntity['strategy'],
      flatStakeAmount: doc.flatStakeAmount,
      percentageStake: doc.percentageStake,
      kellyFraction: doc.kellyFraction,
      minOdds: doc.minOdds,
      maxOdds: doc.maxOdds,
      minValue: doc.minValue,
      onlyHighValue: doc.onlyHighValue,
      dateFrom: doc.dateFrom,
      dateTo: doc.dateTo,
      status: doc.status as SimulationEntity['status'],
      bets: (doc.bets || []).map((b) => Object.assign(new SimulationBetEntity(), b)),
      createdAt: (doc as unknown as { createdAt: Date }).createdAt,
      updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt,
    });
  }

  async create(data: Partial<SimulationEntity>): Promise<SimulationEntity> {
    const doc = await this.simulationModel.create(data);
    return this.toEntity(doc);
  }

  async update(id: string, data: Partial<SimulationDocument>): Promise<SimulationEntity | null> {
    const doc = await this.simulationModel.findByIdAndUpdate(id, data, { new: true }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findById(id: string): Promise<SimulationEntity | null> {
    const doc = await this.simulationModel.findById(id).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByUserId(userId: string): Promise<SimulationEntity[]> {
    const docs = await this.simulationModel.find({ userId }).sort({ createdAt: -1 }).exec();
    return docs.map((d) => this.toEntity(d));
  }
}
