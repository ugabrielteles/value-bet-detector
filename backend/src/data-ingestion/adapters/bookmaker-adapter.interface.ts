export interface BookmakerAdapter {
  fetchFixtures(leagueId: string, date: string): Promise<unknown[]>;
  fetchOdds(matchId: string): Promise<unknown[]>;
  fetchStatistics(matchId: string): Promise<unknown>;
}
