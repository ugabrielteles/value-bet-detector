import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Bankroll, BankrollDocument } from '../models/bankroll.model';
import { BankrollEntity } from '../../domain/entities/bankroll.entity';

@Injectable()
export class BankrollRepository {
  constructor(
    @InjectModel(Bankroll.name)
    private readonly bankrollModel: Model<BankrollDocument>,
  ) {}

  private toEntity(doc: BankrollDocument): BankrollEntity {
    return new BankrollEntity({
      id: doc._id.toString(),
      userId: doc.userId,
      initialBankroll: doc.initialBankroll,
      currentBankroll: doc.currentBankroll,
      minBetPercentage: doc.minBetPercentage,
      maxBetPercentage: doc.maxBetPercentage,
      strategy: doc.strategy as BankrollEntity['strategy'],
      useKellyCriterion: doc.useKellyCriterion,
      kellyFraction: doc.kellyFraction,
      stopLossEnabled: doc.stopLossEnabled,
      stopLossPercentage: doc.stopLossPercentage,
      currency: doc.currency,
      isActive: doc.isActive,
      autoBetEnabled: (doc as any).autoBetEnabled ?? false,
      autoBetProvider: (doc as any).autoBetProvider ?? null,
      autoBetMinValue: (doc as any).autoBetMinValue ?? 5,
      autoBetMinClassification: (doc as any).autoBetMinClassification ?? 'MEDIUM',
      autoBetMaxDailyBets: (doc as any).autoBetMaxDailyBets ?? 10,
      autoBetDryRun: (doc as any).autoBetDryRun !== false,
      createdAt: (doc as unknown as { createdAt: Date }).createdAt,
      updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt,
    });
  }

  async findByUserId(userId: string): Promise<BankrollEntity | null> {
    const doc = await this.bankrollModel.findOne({ userId }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async upsert(userId: string, data: Partial<BankrollEntity>): Promise<BankrollEntity> {
    const doc = await this.bankrollModel.findOneAndUpdate(
      { userId },
      { ...data, userId },
      { new: true, upsert: true },
    ).exec();
    return this.toEntity(doc);
  }

  async findUserIdsWithAutoBetEnabled(): Promise<string[]> {
    const docs = await this.bankrollModel.find({ autoBetEnabled: true }, 'userId').exec();
    return docs.map((d) => d.userId);
  }
}
