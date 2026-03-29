import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AutoBet, AutoBetDocument } from '../models/auto-bet.model';
import { AutoBetEntity, AutoBetStatus } from '../../domain/entities/auto-bet.entity';

@Injectable()
export class AutoBetsRepository {
  constructor(
    @InjectModel(AutoBet.name)
    private readonly model: Model<AutoBetDocument>,
  ) {}

  private toEntity(doc: AutoBetDocument): AutoBetEntity {
    const entity = new AutoBetEntity();
    entity.id = doc._id.toString();
    entity.userId = doc.userId;
    entity.valueBetId = doc.valueBetId;
    entity.matchId = doc.matchId;
    entity.bookmaker = doc.bookmaker;
    entity.bookmakerUrl = doc.bookmakerUrl;
    entity.market = doc.market;
    entity.outcome = doc.outcome;
    entity.bookmakerOdds = doc.bookmakerOdds;
    entity.modelProbability = doc.modelProbability;
    entity.valueEdge = doc.valueEdge;
    entity.stakeAmount = doc.stakeAmount;
    entity.stakeStrategy = doc.stakeStrategy;
    entity.bankrollAtBet = doc.bankrollAtBet;
    entity.status = doc.status as AutoBetStatus;
    entity.placedAt = doc.placedAt;
    entity.betSlipId = doc.betSlipId;
    entity.automationLog = doc.automationLog ?? [];
    entity.automationError = doc.automationError;
    entity.actualProfit = doc.actualProfit;
    entity.resolvedAt = doc.resolvedAt;
    entity.createdAt = (doc as unknown as { createdAt: Date }).createdAt;
    entity.updatedAt = (doc as unknown as { updatedAt: Date }).updatedAt;
    return entity;
  }

  async create(data: Partial<AutoBetEntity>): Promise<AutoBetEntity> {
    const doc = await this.model.create(data);
    return this.toEntity(doc);
  }

  async findById(id: string): Promise<AutoBetEntity | null> {
    const doc = await this.model.findById(id).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByUserAndId(userId: string, id: string): Promise<AutoBetEntity | null> {
    const doc = await this.model.findOne({ _id: id, userId }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async existsForValueBet(userId: string, valueBetId: string): Promise<boolean> {
    const count = await this.model.countDocuments({ userId, valueBetId }).exec();
    return count > 0;
  }

  async findByUser(
    userId: string,
    filters: { status?: AutoBetStatus | 'all'; page?: number; limit?: number },
  ): Promise<{ data: AutoBetEntity[]; total: number }> {
    const query: Record<string, unknown> = { userId };
    if (filters.status && filters.status !== 'all') query.status = filters.status;

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.model.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.model.countDocuments(query).exec(),
    ]);

    return { data: data.map((d) => this.toEntity(d)), total };
  }

  async findQueuedForUser(userId: string): Promise<AutoBetEntity[]> {
    const docs = await this.model.find({ userId, status: 'queued' }).sort({ createdAt: 1 }).exec();
    return docs.map((d) => this.toEntity(d));
  }

  async countTodayForUser(userId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.model.countDocuments({ userId, createdAt: { $gte: startOfDay } }).exec();
  }

  async update(id: string, data: Partial<AutoBetEntity>): Promise<AutoBetEntity | null> {
    const doc = await this.model.findByIdAndUpdate(id, data, { new: true }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async getAnalytics(userId: string): Promise<{
    byStatus: Array<{ status: string; count: number; totalStaked: number; totalProfit: number }>;
    byBookmaker: Array<{ bookmaker: string; totalBets: number; won: number; totalStaked: number; totalProfit: number }>;
    byMarket: Array<{ market: string; totalBets: number; won: number; totalStaked: number; totalProfit: number }>;
    dailyPnl: Array<{ date: string; bets: number; profit: number; staked: number }>;
  }> {
    const [byStatus, byBookmaker, byMarket, dailyPnl] = await Promise.all([
      this.model.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalStaked: { $sum: '$stakeAmount' },
            totalProfit: { $sum: { $ifNull: ['$actualProfit', 0] } },
          },
        },
      ]),
      this.model.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: '$bookmaker',
            totalBets: { $sum: 1 },
            won: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
            totalStaked: { $sum: '$stakeAmount' },
            totalProfit: { $sum: { $ifNull: ['$actualProfit', 0] } },
          },
        },
        { $sort: { totalBets: -1 } },
      ]),
      this.model.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: '$market',
            totalBets: { $sum: 1 },
            won: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
            totalStaked: { $sum: '$stakeAmount' },
            totalProfit: { $sum: { $ifNull: ['$actualProfit', 0] } },
          },
        },
        { $sort: { totalBets: -1 } },
      ]),
      this.model.aggregate([
        { $match: { userId, createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            bets: { $sum: 1 },
            staked: { $sum: '$stakeAmount' },
            profit: { $sum: { $ifNull: ['$actualProfit', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return {
      byStatus: byStatus.map((s: { _id: string; count: number; totalStaked: number; totalProfit: number }) => ({
        status: s._id,
        count: s.count,
        totalStaked: s.totalStaked,
        totalProfit: s.totalProfit,
      })),
      byBookmaker: byBookmaker.map((b: { _id: string; totalBets: number; won: number; totalStaked: number; totalProfit: number }) => ({
        bookmaker: b._id,
        totalBets: b.totalBets,
        won: b.won,
        totalStaked: b.totalStaked,
        totalProfit: b.totalProfit,
      })),
      byMarket: byMarket.map((m: { _id: string; totalBets: number; won: number; totalStaked: number; totalProfit: number }) => ({
        market: m._id,
        totalBets: m.totalBets,
        won: m.won,
        totalStaked: m.totalStaked,
        totalProfit: m.totalProfit,
      })),
      dailyPnl: dailyPnl.map((d: { _id: string; bets: number; staked: number; profit: number }) => ({
        date: d._id,
        bets: d.bets,
        staked: d.staked,
        profit: d.profit,
      })),
    };
  }
}
