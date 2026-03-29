import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OpportunityResult = 'pending' | 'won' | 'lost' | 'void';
export type OpportunityPhase = 'pre-match' | 'live';

@Schema({ _id: false })
export class OpportunityProjectionSnapshot {
  @Prop({ required: true })
  goals: number;

  @Prop({ required: true })
  shots: number;

  @Prop({ required: true })
  shotsOnTarget: number;

  @Prop({ required: true })
  corners: number;
}

@Schema({ _id: false })
export class OpportunityTeamSnapshot {
  @Prop({ required: true })
  expectedGoals: number;

  @Prop({ required: true })
  expectedShots: number;

  @Prop({ required: true })
  expectedShotsOnTarget: number;

  @Prop({ required: true })
  expectedCorners: number;
}

@Schema({ _id: false })
export class OpportunityWinProbabilities {
  @Prop({ required: true })
  home: number;

  @Prop({ required: true })
  draw: number;

  @Prop({ required: true })
  away: number;
}

export type PredictionOpportunityDocument = PredictionOpportunity & Document;

@Schema({ timestamps: true, collection: 'prediction_opportunities' })
export class PredictionOpportunity {
  @Prop({ required: true, index: true })
  matchId: string;

  @Prop({ index: true })
  matchStartTime?: Date;

  @Prop()
  homeTeamName?: string;

  @Prop()
  awayTeamName?: string;

  @Prop({ index: true })
  leagueId?: string;

  @Prop()
  leagueName?: string;

  @Prop({ index: true })
  leagueCountry?: string;

  @Prop({ default: false, index: true })
  isInternational: boolean;

  @Prop({ required: true, index: true })
  market: string;

  @Prop({ required: true })
  selection: string;

  @Prop({ required: true, enum: ['pre-match', 'live'], index: true })
  phase: OpportunityPhase;

  @Prop({ required: true, min: 0, max: 1 })
  confidence: number;

  @Prop()
  valueEdge?: number;

  @Prop({ required: true })
  rationale: string;

  @Prop({ required: true, enum: ['scheduled', 'live', 'finished', 'cancelled'], index: true })
  matchStatus: string;

  @Prop({ required: true, enum: ['pending', 'won', 'lost', 'void'], default: 'pending', index: true })
  result: OpportunityResult;

  @Prop({ required: true })
  generatedAt: Date;

  @Prop({ type: OpportunityProjectionSnapshot, required: true })
  projectedTotals: OpportunityProjectionSnapshot;

  @Prop({ type: OpportunityTeamSnapshot, required: true })
  projectedHome: OpportunityTeamSnapshot;

  @Prop({ type: OpportunityTeamSnapshot, required: true })
  projectedAway: OpportunityTeamSnapshot;

  @Prop({ type: OpportunityWinProbabilities, required: true })
  winProbabilities: OpportunityWinProbabilities;
}

export const PredictionOpportunitySchema = SchemaFactory.createForClass(PredictionOpportunity);
PredictionOpportunitySchema.index({ matchId: 1, generatedAt: -1 });
PredictionOpportunitySchema.index({ phase: 1, generatedAt: -1 });
PredictionOpportunitySchema.index({ market: 1, result: 1 });
