import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type ValueBetDocument = ValueBet & Document;

@Schema({ timestamps: true, collection: 'value_bets' })
export class ValueBet {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  matchId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  predictionId: string;

  @Prop({ required: true })
  bookmaker: string;

  @Prop()
  bookmakerUrl: string;

  @Prop({ required: true })
  market: string;

  @Prop({ required: true })
  outcome: string;

  @Prop({ required: true, min: 0, max: 1 })
  modelProbability: number;

  @Prop({ required: true, min: 1 })
  bookmakerOdds: number;

  @Prop({ required: true, min: 0, max: 1 })
  impliedProbability: number;

  @Prop({ required: true })
  value: number;

  @Prop({ enum: ['HIGH', 'MEDIUM', 'LOW'], required: true })
  classification: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ required: true, index: true, default: Date.now })
  detectedAt: Date;

  @Prop()
  expiresAt: Date;

  @Prop({ enum: ['pending', 'won', 'lost', 'void'], default: 'pending' })
  status: string;

  @Prop({ default: 0 })
  stakeAmount: number;

  @Prop({ default: 0 })
  profit: number;

  @Prop()
  resolvedAt: Date;
}

export const ValueBetSchema = SchemaFactory.createForClass(ValueBet);
