import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BankrollDocument = Bankroll & Document;

@Schema({ timestamps: true, collection: 'bankrolls' })
export class Bankroll {
  @Prop({ required: true, unique: true })
  userId: string;

  @Prop({ required: true, min: 0 })
  initialBankroll: number;

  @Prop({ required: true, min: 0 })
  currentBankroll: number;

  @Prop({ default: 1 })
  minBetPercentage: number;

  @Prop({ default: 5 })
  maxBetPercentage: number;

  @Prop({ enum: ['flat', 'kelly', 'percentage'], default: 'kelly' })
  strategy: string;

  @Prop({ default: true })
  useKellyCriterion: boolean;

  @Prop({ default: 0.5 })
  kellyFraction: number;

  @Prop({ default: false })
  stopLossEnabled: boolean;

  @Prop({ default: 20 })
  stopLossPercentage: number;

  @Prop({ default: 'BRL' })
  currency: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Map, of: Number, default: {} })
  providerBalances: Record<string, number>;

  // Auto-bet settings
  @Prop({ default: false })
  autoBetEnabled: boolean;

  @Prop({ default: null })
  autoBetProvider: string;

  @Prop({ default: 5 })
  autoBetMinValue: number;

  @Prop({ enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' })
  autoBetMinClassification: string;

  @Prop({ default: 10 })
  autoBetMaxDailyBets: number;

  @Prop({ default: true })
  autoBetDryRun: boolean;
}

export const BankrollSchema = SchemaFactory.createForClass(Bankroll);
