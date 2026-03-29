export interface TeamInfo {
  id: string;
  name: string;
  logo?: string;
}

export interface LeagueInfo {
  id: string;
  name: string;
  country?: string;
  logo?: string;
}

export interface MatchStats {
  homeXG?: number;
  awayXG?: number;
  homeShots?: number;
  awayShots?: number;
  homeShotsOnTarget?: number;
  awayShotsOnTarget?: number;
  homeCorners?: number;
  awayCorners?: number;
  homePossession?: number;
  awayPossession?: number;
  homeForm?: string[];
  awayForm?: string[];
}

export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'cancelled';

export class MatchEntity {
  id: string;
  matchId: string;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  league: LeagueInfo;
  startTime: Date;
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
  stats?: MatchStats;
  createdAt: Date;
  updatedAt: Date;
}
