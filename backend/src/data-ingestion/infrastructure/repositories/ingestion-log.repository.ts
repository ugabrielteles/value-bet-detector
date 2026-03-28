import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  IngestionLog,
  IngestionLogDocument,
  IngestionProcessType,
  IngestionRunStatus,
  IngestionTriggerType,
} from '../models/ingestion-log.model';

export interface CreateIngestionLogInput {
  processType: IngestionProcessType;
  trigger: IngestionTriggerType;
  status: IngestionRunStatus;
  date: string;
  leagueId: string;
  fixturesFetched: number;
  matchesUpserted: number;
  oddsSaved: number;
  fixturesWithNoOdds: number;
  fallbackUsed: boolean;
  fallbackDate?: string;
  errorList: string[];
  errorMessage?: string;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
}

export interface FindIngestionLogsFilters {
  limit?: number;
  processType?: IngestionProcessType;
  trigger?: IngestionTriggerType;
  status?: IngestionRunStatus;
  fallbackUsed?: boolean;
}

@Injectable()
export class IngestionLogRepository {
  constructor(
    @InjectModel(IngestionLog.name)
    private readonly ingestionLogModel: Model<IngestionLogDocument>,
  ) {}

  async create(data: CreateIngestionLogInput): Promise<void> {
    await this.ingestionLogModel.create(data);
  }

  async findLatest(filters: FindIngestionLogsFilters = {}): Promise<IngestionLog[]> {
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
    const query: Record<string, unknown> = {};

    if (filters.processType) query.processType = filters.processType;
    if (filters.trigger) query.trigger = filters.trigger;
    if (filters.status) query.status = filters.status;
    if (typeof filters.fallbackUsed === 'boolean') query.fallbackUsed = filters.fallbackUsed;

    return this.ingestionLogModel.find(query).sort({ startedAt: -1 }).limit(limit).lean().exec();
  }
}
