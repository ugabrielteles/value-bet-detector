import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OddsHistory, OddsHistoryDocument } from '../models/odds-history.model';
import { OddsEntity } from '../../domain/entities/odds.entity';

@Injectable()
export class OddsRepository {
  constructor(
    @InjectModel(OddsHistory.name)
    private readonly oddsModel: Model<OddsHistoryDocument>,
  ) {}

  private toEntity(doc: OddsHistoryDocument): OddsEntity {
    const entity = new OddsEntity();
    entity.id = doc._id.toString();
    entity.matchId = doc.matchId;
    entity.bookmaker = doc.bookmaker;
    entity.market = doc.market;
    entity.homeOdds = doc.homeOdds;
    entity.drawOdds = doc.drawOdds;
    entity.awayOdds = doc.awayOdds;
    entity.overOdds = doc.overOdds;
    entity.underOdds = doc.underOdds;
    entity.timestamp = doc.timestamp;
    entity.isSteamMove = doc.isSteamMove;
    entity.previousOdds = doc.previousOdds;
    return entity;
  }

  async save(data: Partial<OddsEntity>): Promise<OddsEntity> {
    const doc = await this.oddsModel.create({ ...data, timestamp: data.timestamp || new Date() });
    return this.toEntity(doc);
  }

  async getLatest(matchId: string): Promise<OddsEntity | null> {
    const doc = await this.oddsModel.findOne({ matchId }).sort({ timestamp: -1 }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async getHistory(matchId: string): Promise<OddsEntity[]> {
    const docs = await this.oddsModel.find({ matchId }).sort({ timestamp: -1 }).exec();
    return docs.map((d) => this.toEntity(d));
  }

  async getSteamMoves(matchId: string): Promise<OddsEntity[]> {
    const docs = await this.oddsModel.find({ matchId, isSteamMove: true }).sort({ timestamp: -1 }).exec();
    return docs.map((d) => this.toEntity(d));
  }
}
