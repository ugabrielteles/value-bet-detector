export interface PredictionResult {
  homeProbability: number;
  drawProbability: number;
  awayProbability: number;
  overProbability: number;
  underProbability: number;
  confidence: number;
  cornerOverProbability?: number;
  cornerUnderProbability?: number;
}

export interface PredictionInput {
  homeTeam: {
    last5?: string[];
    xG?: number;
    leaguePosition?: number;
    attackStrength?: number;
    defenseStrength?: number;
  };
  awayTeam: {
    last5?: string[];
    xG?: number;
    leaguePosition?: number;
    attackStrength?: number;
    defenseStrength?: number;
  };
  h2h?: { homeWins: number; draws: number; awayWins: number };
  currentOdds?: { home: number; draw: number; away: number };
}

export interface IPredictionModel {
  predict(input: PredictionInput): PredictionResult;
}
