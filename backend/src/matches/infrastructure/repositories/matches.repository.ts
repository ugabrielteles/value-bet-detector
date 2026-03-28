import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Match, MatchDocument } from '../models/match.model';
import { MatchEntity } from '../../domain/entities/match.entity';

@Injectable()
export class MatchesRepository {
  constructor(@InjectModel(Match.name) private readonly matchModel: Model<MatchDocument>) {}

  private toEntity(doc: MatchDocument): MatchEntity {
    const entity = new MatchEntity();
    entity.id = doc._id.toString();
    entity.matchId = doc.matchId;
    entity.homeTeam = doc.homeTeam;
    entity.awayTeam = doc.awayTeam;
    entity.league = doc.league;
    entity.startTime = doc.startTime;
    entity.status = doc.status as MatchEntity['status'];
    entity.homeScore = doc.homeScore;
    entity.awayScore = doc.awayScore;
    entity.stats = doc.stats;
    entity.createdAt = (doc as unknown as { createdAt: Date }).createdAt;
    entity.updatedAt = (doc as unknown as { updatedAt: Date }).updatedAt;
    return entity;
  }

  async findAll(filters: { status?: string; league?: string } = {}): Promise<MatchEntity[]> {
    const query: Record<string, unknown> = {};
    if (filters.status) query.status = filters.status;
    if (filters.league) query['league.name'] = new RegExp(filters.league, 'i');
    const docs = await this.matchModel.find(query).sort({ startTime: 1 }).exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findById(id: string): Promise<MatchEntity | null> {
    const doc = await this.matchModel.findById(id).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByMatchId(matchId: string): Promise<MatchEntity | null> {
    const doc = await this.matchModel.findOne({ matchId }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async create(data: Partial<MatchEntity>): Promise<MatchEntity> {
    const doc = await this.matchModel.create(data);
    return this.toEntity(doc);
  }

  async update(id: string, data: Partial<MatchEntity>): Promise<MatchEntity | null> {
    const doc = await this.matchModel.findByIdAndUpdate(id, data, { new: true }).exec();
    return doc ? this.toEntity(doc) : null;
  }
}
