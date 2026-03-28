import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type IngestionLogDocument = IngestionLog & Document;

export type IngestionProcessType = 'fixtures' | 'odds';
export type IngestionTriggerType = 'manual' | 'cron';
export type IngestionRunStatus = 'success' | 'partial' | 'failed';

@Schema({ timestamps: true, collection: 'ingestion_logs' })
export class IngestionLog {
  @Prop({ required: true, enum: ['fixtures', 'odds'], index: true })
  processType: IngestionProcessType;

  @Prop({ required: true, enum: ['manual', 'cron'], index: true })
  trigger: IngestionTriggerType;

  @Prop({ required: true, enum: ['success', 'partial', 'failed'], index: true })
  status: IngestionRunStatus;

  @Prop({ required: true, index: true })
  date: string;

  @Prop({ required: true, index: true })
  leagueId: string;

  @Prop({ required: true, min: 0 })
  fixturesFetched: number;

  @Prop({ required: true, min: 0 })
  matchesUpserted: number;

  @Prop({ required: true, min: 0 })
  oddsSaved: number;

  @Prop({ required: true, min: 0 })
  fixturesWithNoOdds: number;

  @Prop({ required: true, default: false })
  fallbackUsed: boolean;

  @Prop()
  fallbackDate?: string;

  @Prop({ type: [String], default: [] })
  errorList: string[];

  @Prop()
  errorMessage?: string;

  @Prop({ required: true, default: Date.now })
  startedAt: Date;

  @Prop({ required: true, default: Date.now })
  finishedAt: Date;

  @Prop({ required: true, min: 0 })
  durationMs: number;
}

export const IngestionLogSchema = SchemaFactory.createForClass(IngestionLog);
IngestionLogSchema.index({ processType: 1, startedAt: -1 });
