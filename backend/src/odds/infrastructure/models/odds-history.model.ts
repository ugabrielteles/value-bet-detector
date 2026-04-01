import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OddsHistoryDocument = OddsHistory & Document;

@Schema({ timestamps: true, collection: 'odds_history' })
export class OddsHistory {
  @Prop({ required: true })
  matchId: string;

  @Prop({ required: true })
  bookmaker: string;

  @Prop()
  bookmakerUrl: string;

  @Prop({ default: '1X2' })
  market: string;

  @Prop({ required: true })
  homeOdds: number;

  @Prop({ required: true })
  drawOdds: number;

  @Prop({ required: true })
  awayOdds: number;

  @Prop()
  overOdds: number;

  @Prop()
  underOdds: number;

  @Prop()
  cornerOverOdds: number;

  @Prop()
  cornerUnderOdds: number;

  @Prop()
  cornerLine: number;

  @Prop({ required: true, index: true, default: Date.now })
  timestamp: Date;

  @Prop({ default: false })
  isSteamMove: boolean;

  @Prop()
  previousOdds: number;
}

export const OddsHistorySchema = SchemaFactory.createForClass(OddsHistory);
OddsHistorySchema.index({ matchId: 1, timestamp: -1 });
