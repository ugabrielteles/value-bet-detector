import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MatchDocument = Match & Document;

@Schema({ timestamps: true, collection: 'matches' })
export class Match {
  @Prop({ required: true, index: true })
  matchId: string;

  @Prop({ type: Object, required: true })
  homeTeam: { id: string; name: string; logo?: string };

  @Prop({ type: Object, required: true })
  awayTeam: { id: string; name: string; logo?: string };

  @Prop({ type: Object, required: true })
  league: { id: string; name: string; country?: string; logo?: string };

  @Prop({ required: true, index: true })
  startTime: Date;

  @Prop({ enum: ['scheduled', 'live', 'finished', 'cancelled'], default: 'scheduled' })
  status: string;

  @Prop({ default: 0 })
  homeScore: number;

  @Prop({ default: 0 })
  awayScore: number;

  @Prop({
    type: {
      homeXG: Number,
      awayXG: Number,
      homeShots: Number,
      awayShots: Number,
      homePossession: Number,
      awayPossession: Number,
      homeForm: [String],
      awayForm: [String],
    },
  })
  stats: {
    homeXG?: number;
    awayXG?: number;
    homeShots?: number;
    awayShots?: number;
    homePossession?: number;
    awayPossession?: number;
    homeForm?: string[];
    awayForm?: string[];
  };
}

export const MatchSchema = SchemaFactory.createForClass(Match);
