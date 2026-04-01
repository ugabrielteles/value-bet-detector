import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Prediction, PredictionDocument } from '../models/prediction.model';
import { PredictionEntity } from '../../domain/entities/prediction.entity';

@Injectable()
export class PredictionsRepository {
  constructor(
    @InjectModel(Prediction.name)
    private readonly predictionModel: Model<PredictionDocument>,
  ) {}

  private toEntity(doc: PredictionDocument): PredictionEntity {
    const entity = new PredictionEntity();
    entity.id = doc._id.toString();
    entity.matchId = doc.matchId;
    entity.homeProbability = doc.homeProbability;
    entity.drawProbability = doc.drawProbability;
    entity.awayProbability = doc.awayProbability;
    entity.overProbability = doc.overProbability;
    entity.underProbability = doc.underProbability;
    entity.cornerOverProbability = doc.cornerOverProbability;
    entity.cornerUnderProbability = doc.cornerUnderProbability;
    entity.confidence = doc.confidence;
    entity.models = doc.models;
    entity.createdAt = (doc as unknown as { createdAt: Date }).createdAt;
    return entity;
  }

  async findByMatchId(matchId: string): Promise<PredictionEntity | null> {
    const doc = await this.predictionModel.findOne({ matchId }).sort({ createdAt: -1 }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async save(data: Partial<PredictionEntity>): Promise<PredictionEntity> {
    const { matchId, ...fields } = data;
    const doc = await this.predictionModel
      .findOneAndUpdate(
        { matchId },
        { $set: fields },
        { new: true, upsert: true, sort: { createdAt: -1 } },
      )
      .exec();
    return this.toEntity(doc!);
  }
}
