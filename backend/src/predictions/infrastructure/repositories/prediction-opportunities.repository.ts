import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  OpportunityResult,
  PredictionOpportunity,
  PredictionOpportunityDocument,
} from '../models/prediction-opportunity.model';

export interface CreatePredictionOpportunityInput {
  matchId: string;
  matchStartTime?: Date;
  homeTeamName?: string;
  awayTeamName?: string;
  leagueId?: string;
  leagueName?: string;
  leagueCountry?: string;
  isInternational: boolean;
  market: string;
  selection: string;
  phase: 'pre-match' | 'live';
  confidence: number;
  valueEdge?: number;
  rationale: string;
  matchStatus: 'scheduled' | 'live' | 'finished' | 'cancelled';
  result: OpportunityResult;
  generatedAt: Date;
  projectedTotals: {
    goals: number;
    shots: number;
    shotsOnTarget: number;
    corners: number;
  };
  projectedHome: {
    expectedGoals: number;
    expectedShots: number;
    expectedShotsOnTarget: number;
    expectedCorners: number;
  };
  projectedAway: {
    expectedGoals: number;
    expectedShots: number;
    expectedShotsOnTarget: number;
    expectedCorners: number;
  };
  winProbabilities: {
    home: number;
    draw: number;
    away: number;
  };
}

export interface OpportunityMarketStats {
  market: string;
  total: number;
  won: number;
  lost: number;
  pending: number;
  hitRate: number;
}

export interface PendingOpportunityRow {
  _id: string;
  matchId: string;
  market: string;
  selection: string;
  result: OpportunityResult;
  matchStatus: string;
}

export interface LiveOpportunityFilters {
  leagueIds?: string[];
  countries?: string[];
  internationalOnly?: boolean;
}

@Injectable()
export class PredictionOpportunitiesRepository {
  constructor(
    @InjectModel(PredictionOpportunity.name)
    private readonly model: Model<PredictionOpportunityDocument>,
  ) {}

  async createMany(inputs: CreatePredictionOpportunityInput[]): Promise<void> {
    if (inputs.length === 0) return;
    await this.model.insertMany(inputs);
  }

  async findLatestLive(limit = 50, filters: LiveOpportunityFilters = {}): Promise<PredictionOpportunity[]> {
    const cap = Math.max(1, Math.min(limit, 200));
    const query: Record<string, unknown> = { matchStatus: 'live' };

    if (filters.internationalOnly) {
      query.isInternational = true;
    }

    if (filters.leagueIds && filters.leagueIds.length > 0) {
      query.leagueId = { $in: filters.leagueIds };
    }

    if (filters.countries && filters.countries.length > 0) {
      query.leagueCountry = { $in: filters.countries };
    }

    return this.model
      .find(query)
      .sort({ generatedAt: -1, confidence: -1 })
      .limit(cap)
      .lean()
      .exec();
  }

  async findByMatchId(matchId: string, limit = 100): Promise<PredictionOpportunity[]> {
    const cap = Math.max(1, Math.min(limit, 500));
    return this.model
      .find({ matchId })
      .sort({ generatedAt: -1, confidence: -1 })
      .limit(cap)
      .lean()
      .exec();
  }

  async getMarketStats(): Promise<OpportunityMarketStats[]> {
    const rows = await this.model
      .aggregate<{
        _id: string;
        total: number;
        won: number;
        lost: number;
        pending: number;
      }>([
        {
          $group: {
            _id: '$market',
            total: { $sum: 1 },
            won: { $sum: { $cond: [{ $eq: ['$result', 'won'] }, 1, 0] } },
            lost: { $sum: { $cond: [{ $eq: ['$result', 'lost'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$result', 'pending'] }, 1, 0] } },
          },
        },
        { $sort: { total: -1 } },
      ])
      .exec();

    return rows.map((r) => {
      const settled = r.won + r.lost;
      return {
        market: r._id,
        total: r.total,
        won: r.won,
        lost: r.lost,
        pending: r.pending,
        hitRate: settled > 0 ? r.won / settled : 0,
      };
    });
  }

  async findPending(limit = 500): Promise<PendingOpportunityRow[]> {
    const cap = Math.max(1, Math.min(limit, 2000));
    const docs = await this.model
      .find({ result: 'pending' })
      .sort({ generatedAt: -1 })
      .limit(cap)
      .select('_id matchId market selection result matchStatus')
      .lean()
      .exec();

    return docs.map((d) => ({
      _id: d._id.toString(),
      matchId: d.matchId,
      market: d.market,
      selection: d.selection,
      result: d.result,
      matchStatus: d.matchStatus,
    }));
  }

  async findPendingLive(limit = 1000): Promise<PendingOpportunityRow[]> {
    const cap = Math.max(1, Math.min(limit, 5000));
    const docs = await this.model
      .find({ result: 'pending', matchStatus: 'live' })
      .sort({ generatedAt: -1 })
      .limit(cap)
      .select('_id matchId market selection result matchStatus')
      .lean()
      .exec();

    return docs.map((d) => ({
      _id: d._id.toString(),
      matchId: d.matchId,
      market: d.market,
      selection: d.selection,
      result: d.result,
      matchStatus: d.matchStatus,
    }));
  }

  async updateResult(id: string, result: OpportunityResult, matchStatus: string): Promise<void> {
    await this.model.findByIdAndUpdate(id, { result, matchStatus }).exec();
  }
}
