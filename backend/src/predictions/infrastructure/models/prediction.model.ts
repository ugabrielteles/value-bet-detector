import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PredictionDocument = Prediction & Document;

@Schema({ timestamps: true, collection: 'predictions' })
export class Prediction {
  @Prop({ required: true, index: true })
  matchId: string;

  @Prop({ required: true, min: 0, max: 1 })
  homeProbability: number;

  @Prop({ required: true, min: 0, max: 1 })
  drawProbability: number;

  @Prop({ required: true, min: 0, max: 1 })
  awayProbability: number;

  @Prop({ min: 0, max: 1, default: 0.5 })
  overProbability: number;

  @Prop({ min: 0, max: 1, default: 0.5 })
  underProbability: number;

  @Prop({ min: 0, max: 1 })
  cornerOverProbability: number;

  @Prop({ min: 0, max: 1 })
  cornerUnderProbability: number;

  @Prop({ min: 0, max: 1, default: 0.7 })
  confidence: number;

  @Prop({ type: [String], default: [] })
  models: string[];
}

export const PredictionSchema = SchemaFactory.createForClass(Prediction);
