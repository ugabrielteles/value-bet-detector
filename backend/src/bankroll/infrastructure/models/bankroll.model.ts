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

  @Prop({ default: 'USD' })
  currency: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const BankrollSchema = SchemaFactory.createForClass(Bankroll);
