export class OddsEntity {
  id: string;
  matchId: string;
  bookmaker: string;
  market: string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  overOdds?: number;
  underOdds?: number;
  timestamp: Date;
  isSteamMove: boolean;
  previousOdds?: number;
}
