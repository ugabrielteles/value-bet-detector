import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ValueBet, ValueBetDocument } from '../../value-bets/infrastructure/models/value-bet.model';

export interface AnalyticsSummary {
  totalBets: number;
  settledBets: number;
  pendingBets: number;
  wonBets: number;
  lostBets: number;
  voidBets: number;
  totalStaked: number;
  totalProfit: number;
  roi: number;
  hitRate: number;
  yield: number;
  averageOdds: number;
  averageValue: number;
  highValueBets: number;
  mediumValueBets: number;
  lowValueBets: number;
}

export interface DailyPerformance {
  date: string;
  bets: number;
  profit: number;
  cumulativeProfit: number;
  stake: number;
}

export interface PerformanceByCategory {
  classification: string;
  totalBets: number;
  wonBets: number;
  hitRate: number;
  totalProfit: number;
  roi: number;
}

export interface PerformanceByMarket {
  market: string;
  totalBets: number;
  wonBets: number;
  hitRate: number;
  totalProfit: number;
  roi: number;
}

@Injectable()
export class AnalyticsRepository {
  constructor(
    @InjectModel(ValueBet.name)
    private readonly valueBetModel: Model<ValueBetDocument>,
  ) {}

  async getSummary(): Promise<AnalyticsSummary> {
    const [all, byStatus, byClassification, aggregated] = await Promise.all([
      this.valueBetModel.countDocuments(),
      this.valueBetModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      this.valueBetModel.aggregate([{ $group: { _id: '$classification', count: { $sum: 1 } } }]),
      this.valueBetModel.aggregate([
        {
          $group: {
            _id: null,
            totalStaked: { $sum: '$stakeAmount' },
            totalProfit: { $sum: '$profit' },
            averageOdds: { $avg: '$bookmakerOdds' },
            averageValue: { $avg: '$value' },
          },
        },
      ]),
    ]);

    const statusMap: Record<string, number> = {};
    byStatus.forEach((s: { _id: string; count: number }) => { statusMap[s._id] = s.count; });

    const classMap: Record<string, number> = {};
    byClassification.forEach((c: { _id: string; count: number }) => { classMap[c._id] = c.count; });

    const agg = aggregated[0] ?? { totalStaked: 0, totalProfit: 0, averageOdds: 0, averageValue: 0 };
    const wonBets = statusMap['won'] ?? 0;
    const lostBets = statusMap['lost'] ?? 0;
    const settledBets = wonBets + lostBets + (statusMap['void'] ?? 0);

    return {
      totalBets: all,
      settledBets,
      pendingBets: statusMap['pending'] ?? 0,
      wonBets,
      lostBets,
      voidBets: statusMap['void'] ?? 0,
      totalStaked: agg.totalStaked,
      totalProfit: agg.totalProfit,
      roi: agg.totalStaked > 0 ? (agg.totalProfit / agg.totalStaked) * 100 : 0,
      hitRate: settledBets > 0 ? (wonBets / settledBets) * 100 : 0,
      yield: agg.totalStaked > 0 ? (agg.totalProfit / agg.totalStaked) * 100 : 0,
      averageOdds: agg.averageOdds,
      averageValue: agg.averageValue,
      highValueBets: classMap['HIGH'] ?? 0,
      mediumValueBets: classMap['MEDIUM'] ?? 0,
      lowValueBets: classMap['LOW'] ?? 0,
    };
  }

  async getDailyPerformance(days = 30): Promise<DailyPerformance[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await this.valueBetModel.aggregate([
      { $match: { detectedAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$detectedAt' } },
          bets: { $sum: 1 },
          profit: { $sum: '$profit' },
          stake: { $sum: '$stakeAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    let cumulative = 0;
    return results.map((r: { _id: string; bets: number; profit: number; stake: number }) => {
      cumulative += r.profit;
      return { date: r._id, bets: r.bets, profit: r.profit, cumulativeProfit: cumulative, stake: r.stake };
    });
  }

  async getPerformanceByCategory(): Promise<PerformanceByCategory[]> {
    const results = await this.valueBetModel.aggregate([
      {
        $group: {
          _id: '$classification',
          totalBets: { $sum: 1 },
          wonBets: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
          totalProfit: { $sum: '$profit' },
          totalStaked: { $sum: '$stakeAmount' },
        },
      },
    ]);

    return results.map((r: { _id: string; totalBets: number; wonBets: number; totalProfit: number; totalStaked: number }) => ({
      classification: r._id,
      totalBets: r.totalBets,
      wonBets: r.wonBets,
      hitRate: r.totalBets > 0 ? (r.wonBets / r.totalBets) * 100 : 0,
      totalProfit: r.totalProfit,
      roi: r.totalStaked > 0 ? (r.totalProfit / r.totalStaked) * 100 : 0,
    }));
  }

  async getPerformanceByMarket(): Promise<PerformanceByMarket[]> {
    const results = await this.valueBetModel.aggregate([
      {
        $group: {
          _id: '$market',
          totalBets: { $sum: 1 },
          wonBets: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
          totalProfit: { $sum: '$profit' },
          totalStaked: { $sum: '$stakeAmount' },
        },
      },
    ]);

    return results.map((r: { _id: string; totalBets: number; wonBets: number; totalProfit: number; totalStaked: number }) => ({
      market: r._id,
      totalBets: r.totalBets,
      wonBets: r.wonBets,
      hitRate: r.totalBets > 0 ? (r.wonBets / r.totalBets) * 100 : 0,
      totalProfit: r.totalProfit,
      roi: r.totalStaked > 0 ? (r.totalProfit / r.totalStaked) * 100 : 0,
    }));
  }
}
