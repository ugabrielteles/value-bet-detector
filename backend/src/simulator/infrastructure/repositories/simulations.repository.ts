import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
      projectPending: doc.projectPending,
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

  async findByUserIdPaginated(userId: string, page = 1, limit = 20): Promise<SimulationEntity[]> {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const skip = (safePage - 1) * safeLimit;

    const docs = await this.simulationModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .exec();

    return docs.map((d) => this.toEntity(d));
  }

  async findByUserIdPaginatedSummary(userId: string, page = 1, limit = 20): Promise<Array<Record<string, unknown>>> {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const skip = (safePage - 1) * safeLimit;

    const docs = await this.simulationModel
      .aggregate([
        { $match: { userId } },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: safeLimit },
        {
          $project: {
            _id: 1,
            userId: 1,
            name: 1,
            initialBankroll: 1,
            currentBankroll: 1,
            strategy: 1,
            flatStakeAmount: 1,
            percentageStake: 1,
            kellyFraction: 1,
            minOdds: 1,
            maxOdds: 1,
            minValue: 1,
            onlyHighValue: 1,
            projectPending: 1,
            dateFrom: 1,
            dateTo: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1,
            totalBets: { $size: { $ifNull: ['$bets', []] } },
            wonBets: {
              $size: {
                $filter: {
                  input: { $ifNull: ['$bets', []] },
                  as: 'bet',
                  cond: { $eq: ['$$bet.status', 'won'] },
                },
              },
            },
            lostBets: {
              $size: {
                $filter: {
                  input: { $ifNull: ['$bets', []] },
                  as: 'bet',
                  cond: { $eq: ['$$bet.status', 'lost'] },
                },
              },
            },
            pendingBets: {
              $size: {
                $filter: {
                  input: { $ifNull: ['$bets', []] },
                  as: 'bet',
                  cond: { $eq: ['$$bet.status', 'pending'] },
                },
              },
            },
            totalStaked: {
              $sum: {
                $map: {
                  input: { $ifNull: ['$bets', []] },
                  as: 'bet',
                  in: { $ifNull: ['$$bet.stake', 0] },
                },
              },
            },
            totalProfit: {
              $sum: {
                $map: {
                  input: { $ifNull: ['$bets', []] },
                  as: 'bet',
                  in: { $ifNull: ['$$bet.profit', 0] },
                },
              },
            },
          },
        },
        {
          $addFields: {
            roi: {
              $cond: [
                { $gt: ['$totalStaked', 0] },
                { $divide: ['$totalProfit', '$totalStaked'] },
                0,
              ],
            },
            hitRate: {
              $cond: [
                { $gt: [{ $add: ['$wonBets', '$lostBets'] }, 0] },
                { $divide: ['$wonBets', { $add: ['$wonBets', '$lostBets'] }] },
                0,
              ],
            },
            maxDrawdown: 0,
            bets: [],
          },
        },
      ])
      .exec();

    return docs.map((doc: Record<string, unknown>) => ({
      ...doc,
      id: String(doc._id),
      _id: undefined,
    }));
  }

  async findOwnerById(id: string): Promise<{ id: string; userId: string } | null> {
    const doc = await this.simulationModel
      .findById(id)
      .select({ _id: 1, userId: 1 })
      .lean<{ _id: Types.ObjectId; userId: string }>()
      .exec();

    if (!doc) return null;
    return { id: String(doc._id), userId: doc.userId };
  }

  async findSummaryById(id: string): Promise<Record<string, unknown> | null> {
    if (!Types.ObjectId.isValid(id)) return null;

    const docs = await this.simulationModel
      .aggregate([
        { $match: { _id: new Types.ObjectId(id) } },
        {
          $project: {
            _id: 1,
            userId: 1,
            name: 1,
            initialBankroll: 1,
            currentBankroll: 1,
            strategy: 1,
            flatStakeAmount: 1,
            percentageStake: 1,
            kellyFraction: 1,
            minOdds: 1,
            maxOdds: 1,
            minValue: 1,
            onlyHighValue: 1,
            projectPending: 1,
            dateFrom: 1,
            dateTo: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1,
            totalBets: { $size: { $ifNull: ['$bets', []] } },
            wonBets: {
              $size: {
                $filter: {
                  input: { $ifNull: ['$bets', []] },
                  as: 'bet',
                  cond: { $eq: ['$$bet.status', 'won'] },
                },
              },
            },
            lostBets: {
              $size: {
                $filter: {
                  input: { $ifNull: ['$bets', []] },
                  as: 'bet',
                  cond: { $eq: ['$$bet.status', 'lost'] },
                },
              },
            },
            pendingBets: {
              $size: {
                $filter: {
                  input: { $ifNull: ['$bets', []] },
                  as: 'bet',
                  cond: { $eq: ['$$bet.status', 'pending'] },
                },
              },
            },
            totalStaked: {
              $sum: {
                $map: {
                  input: { $ifNull: ['$bets', []] },
                  as: 'bet',
                  in: { $ifNull: ['$$bet.stake', 0] },
                },
              },
            },
            totalProfit: {
              $sum: {
                $map: {
                  input: { $ifNull: ['$bets', []] },
                  as: 'bet',
                  in: { $ifNull: ['$$bet.profit', 0] },
                },
              },
            },
          },
        },
        {
          $addFields: {
            roi: {
              $cond: [
                { $gt: ['$totalStaked', 0] },
                { $divide: ['$totalProfit', '$totalStaked'] },
                0,
              ],
            },
            hitRate: {
              $cond: [
                { $gt: [{ $add: ['$wonBets', '$lostBets'] }, 0] },
                { $divide: ['$wonBets', { $add: ['$wonBets', '$lostBets'] }] },
                0,
              ],
            },
            maxDrawdown: 0,
            bets: [],
          },
        },
      ])
      .exec();

    const doc = docs[0] as Record<string, unknown> | undefined;
    if (!doc) return null;

    return {
      ...doc,
      id: String(doc._id),
      _id: undefined,
    };
  }

  async findBetsBySimulationIdPaginated(
    id: string,
    page = 1,
    limit = 100,
  ): Promise<{ bets: SimulationBetEntity[]; total: number; page: number; limit: number }> {
    if (!Types.ObjectId.isValid(id)) {
      return { bets: [], total: 0, page: 1, limit: 100 };
    }

    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const skip = (safePage - 1) * safeLimit;

    const docs = await this.simulationModel
      .aggregate([
        { $match: { _id: new Types.ObjectId(id) } },
        {
          $project: {
            total: { $size: { $ifNull: ['$bets', []] } },
            bets: { $slice: [{ $ifNull: ['$bets', []] }, skip, safeLimit] },
          },
        },
      ])
      .exec();

    const doc = docs[0] as { bets?: SimulationBetEntity[]; total?: number } | undefined;

    return {
      bets: (doc?.bets ?? []).map((b) => Object.assign(new SimulationBetEntity(), b)),
      total: doc?.total ?? 0,
      page: safePage,
      limit: safeLimit,
    };
  }

  /**
   * Returns lightweight { id, userId } projections for all simulations that
   * still contain at least one bet with status='pending'. Used by the
   * auto-refresh cron to avoid loading full bets arrays.
   */
  async findAllWithPendingBets(): Promise<Array<{ id: string; userId: string }>> {
    const docs = await this.simulationModel
      .find({ 'bets.status': 'pending' })
      .select({ _id: 1, userId: 1 })
      .lean<Array<{ _id: Types.ObjectId; userId: string }>>()
      .exec();

    return docs.map((d) => ({ id: String(d._id), userId: d.userId }));
  }

  async countByUserId(userId: string): Promise<number> {
    return this.simulationModel.countDocuments({ userId }).exec();
  }
}
