import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SimulationDocument = Simulation & Document;

const SimulationBetSchema = {
  valueBetId: String,
  matchId: String,
  market: String,
  outcome: String,
  bookmaker: String,
  bookmakerUrl: String,
  odds: Number,
  modelProbability: Number,
  value: Number,
  classification: String,
  stake: Number,
  status: String,
  profit: Number,
  bankrollAfter: Number,
};

@Schema({ timestamps: true, collection: 'simulations' })
export class Simulation {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  initialBankroll: number;

  @Prop({ required: true })
  currentBankroll: number;

  @Prop({ enum: ['flat', 'kelly', 'percentage'], default: 'kelly' })
  strategy: string;

  @Prop()
  flatStakeAmount: number;

  @Prop()
  percentageStake: number;

  @Prop({ default: 0.5 })
  kellyFraction: number;

  @Prop()
  minOdds: number;

  @Prop()
  maxOdds: number;

  @Prop()
  minValue: number;

  @Prop({ default: false })
  onlyHighValue: boolean;

  @Prop({ default: false })
  projectPending: boolean;

  @Prop()
  dateFrom: Date;

  @Prop()
  dateTo: Date;

  @Prop({ enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' })
  status: string;

  @Prop({ type: [SimulationBetSchema], default: [] })
  bets: {
    valueBetId: string;
    matchId: string;
    market: string;
    outcome: string;
    bookmaker: string;
    bookmakerUrl?: string;
    odds: number;
    modelProbability: number;
    value: number;
    classification: string;
    stake: number;
    status: string;
    profit: number;
    bankrollAfter: number;
  }[];
}

export const SimulationSchema = SchemaFactory.createForClass(Simulation);
SimulationSchema.index({ userId: 1 });
