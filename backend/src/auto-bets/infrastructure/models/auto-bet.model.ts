import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AutoBetDocument = AutoBet & Document;

@Schema({ timestamps: true, collection: 'auto_bets' })
export class AutoBet {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  valueBetId: string;

  @Prop({ required: true })
  matchId: string;

  @Prop({ required: true })
  bookmaker: string;

  @Prop()
  bookmakerUrl?: string;

  @Prop({ required: true })
  market: string;

  @Prop({ required: true })
  outcome: string;

  @Prop({ required: true })
  bookmakerOdds: number;

  @Prop({ required: true })
  modelProbability: number;

  @Prop({ required: true })
  valueEdge: number;

  @Prop({ required: true, default: 0 })
  stakeAmount: number;

  @Prop({ default: 'kelly' })
  stakeStrategy: string;

  @Prop({ required: true, default: 0 })
  bankrollAtBet: number;

  @Prop({
    enum: ['queued', 'placing', 'placed', 'won', 'lost', 'void', 'failed', 'skipped', 'cancelled'],
    default: 'queued',
    index: true,
  })
  status: string;

  @Prop()
  placedAt?: Date;

  @Prop()
  betSlipId?: string;

  @Prop({ type: [String], default: [] })
  automationLog: string[];

  @Prop()
  automationError?: string;

  @Prop()
  actualProfit?: number;

  @Prop()
  resolvedAt?: Date;
}

export const AutoBetSchema = SchemaFactory.createForClass(AutoBet);
