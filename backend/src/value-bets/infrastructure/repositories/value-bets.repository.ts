import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ValueBet, ValueBetDocument } from '../models/value-bet.model';
import { ValueBetEntity } from '../../domain/entities/value-bet.entity';

@Injectable()
export class ValueBetsRepository {
  constructor(
    @InjectModel(ValueBet.name)
    private readonly valueBetModel: Model<ValueBetDocument>,
  ) {}

  private toEntity(doc: ValueBetDocument): ValueBetEntity {
    const entity = new ValueBetEntity();
    entity.id = doc._id.toString();
    entity.matchId = doc.matchId?.toString();
    entity.predictionId = doc.predictionId?.toString();
    entity.bookmaker = doc.bookmaker;
    entity.bookmakerUrl = doc.bookmakerUrl;
    entity.market = doc.market;
    entity.outcome = doc.outcome;
    entity.modelProbability = doc.modelProbability;
    entity.bookmakerOdds = doc.bookmakerOdds;
    entity.impliedProbability = doc.impliedProbability;
    entity.value = doc.value;
    entity.classification = doc.classification as ValueBetEntity['classification'];
    entity.isActive = doc.isActive;
    entity.detectedAt = doc.detectedAt;
    entity.expiresAt = doc.expiresAt;
    entity.status = doc.status as ValueBetEntity['status'];
    entity.stakeAmount = doc.stakeAmount;
    entity.profit = doc.profit;
    entity.resolvedAt = doc.resolvedAt;
    return entity;
  }

  async create(data: Partial<ValueBetEntity>): Promise<ValueBetEntity> {
    const doc = await this.valueBetModel.create(data);
    return this.toEntity(doc);
  }

  async findActive(page = 1, limit = 20): Promise<{ data: ValueBetEntity[]; total: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.valueBetModel.find({ isActive: true }).sort({ detectedAt: -1 }).skip(skip).limit(limit).exec(),
      this.valueBetModel.countDocuments({ isActive: true }),
    ]);
    return { data: data.map((d) => this.toEntity(d)), total };
  }

  async findByClassification(classification: string): Promise<ValueBetEntity[]> {
    const docs = await this.valueBetModel.find({ classification, isActive: true }).sort({ detectedAt: -1 }).exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findByMatch(matchId: string): Promise<ValueBetEntity[]> {
    const docs = await this.valueBetModel.find({ matchId }).sort({ detectedAt: -1 }).exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findById(id: string): Promise<ValueBetEntity | null> {
    const doc = await this.valueBetModel.findById(id).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async update(id: string, data: Partial<ValueBetDocument>): Promise<ValueBetEntity | null> {
    const doc = await this.valueBetModel.findByIdAndUpdate(id, data, { new: true }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async deactivateExpired(): Promise<void> {
    await this.valueBetModel.updateMany(
      { isActive: true, expiresAt: { $lt: new Date() } },
      { isActive: false },
    );
  }

  async findAll(): Promise<ValueBetEntity[]> {
    const docs = await this.valueBetModel.find().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findSince(since: Date): Promise<ValueBetEntity[]> {
    const docs = await this.valueBetModel
      .find({ detectedAt: { $gte: since }, isActive: true, status: 'pending' })
      .sort({ detectedAt: 1 })
      .exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findExistingActive(
    matchId: string,
    market: string,
    outcome: string,
    bookmaker: string,
  ): Promise<ValueBetEntity | null> {
    const doc = await this.valueBetModel
      .findOne({ matchId, market, outcome, bookmaker, isActive: true, status: 'pending' })
      .exec();
    return doc ? this.toEntity(doc) : null;
  }
}
