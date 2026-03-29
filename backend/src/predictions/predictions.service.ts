import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PoissonModel } from './application/models/poisson.model';
import { LogisticRegressionModel } from './application/models/logistic-regression.model';
import { XGBoostModel } from './application/models/xgboost.model';
import { PredictionsRepository } from './infrastructure/repositories/predictions.repository';
import { PredictionInput, PredictionResult } from './domain/interfaces/prediction-model.interface';
import { PredictionEntity } from './domain/entities/prediction.entity';
import { MatchesService } from '../matches/matches.service';
import { OddsService } from '../odds/odds.service';
import { MatchEntity } from '../matches/domain/entities/match.entity';
import { OddsEntity } from '../odds/domain/entities/odds.entity';
import {
  CreatePredictionOpportunityInput,
  LiveOpportunityFilters,
  OpportunityMarketStats,
  PendingOpportunityRow,
  PredictionOpportunitiesRepository,
} from './infrastructure/repositories/prediction-opportunities.repository';
import { OpportunityResult, PredictionOpportunity } from './infrastructure/models/prediction-opportunity.model';

type TeamSide = 'home' | 'away';

export interface TeamProjection {
  side: TeamSide;
  expectedGoals: number;
  expectedShots: number;
  expectedShotsOnTarget: number;
  expectedCorners: number;
}

export interface BettingOpportunity {
  market: string;
  selection: string;
  phase: 'pre-match' | 'live';
  confidence: number;
  valueEdge?: number;
  rationale: string;
}

export interface MatchPredictionInsights {
  matchId: string;
  matchStartTime: Date;
  homeTeamName?: string;
  awayTeamName?: string;
  matchStatus: MatchEntity['status'];
  generatedAt: Date;
  winProbabilities: {
    home: number;
    draw: number;
    away: number;
  };
  projectedTeams: {
    home: TeamProjection;
    away: TeamProjection;
  };
  projectedTotals: {
    goals: number;
    shots: number;
    shotsOnTarget: number;
    corners: number;
  };
  opportunities: BettingOpportunity[];
}

export interface TodayOpportunitiesFilters {
  leagueIds?: string[];
  countries?: string[];
  internationalOnly?: boolean;
}

export interface RecalculatePredictionsOptions {
  statuses?: MatchEntity['status'][];
  limit?: number;
}

@Injectable()
export class PredictionsService {
  private readonly logger = new Logger(PredictionsService.name);
  private readonly poissonModel = new PoissonModel();
  private readonly logisticModel = new LogisticRegressionModel();
  private readonly xgboostModel = new XGBoostModel();

  constructor(
    private readonly predictionsRepository: PredictionsRepository,
    private readonly matchesService: MatchesService,
    private readonly oddsService: OddsService,
    private readonly opportunitiesRepository: PredictionOpportunitiesRepository,
  ) {}

  runAllModels(input: PredictionInput): { poisson: PredictionResult; logistic: PredictionResult; xgboost: PredictionResult } {
    return {
      poisson: this.poissonModel.predict(input),
      logistic: this.logisticModel.predict(input),
      xgboost: this.xgboostModel.predict(input),
    };
  }

  ensemblePrediction(results: PredictionResult[]): PredictionResult {
    const n = results.length;
    const avg = (key: keyof PredictionResult) =>
      results.reduce((acc, r) => acc + (r[key] as number), 0) / n;

    return {
      homeProbability: avg('homeProbability'),
      drawProbability: avg('drawProbability'),
      awayProbability: avg('awayProbability'),
      overProbability: avg('overProbability'),
      underProbability: avg('underProbability'),
      confidence: avg('confidence'),
    };
  }

  async savePrediction(matchId: string, result: PredictionResult): Promise<PredictionEntity> {
    return this.predictionsRepository.save({ matchId, ...result, models: ['poisson', 'logistic', 'xgboost'] });
  }

  async getPrediction(matchId: string): Promise<PredictionEntity | null> {
    return this.predictionsRepository.findByMatchId(matchId);
  }

  async runAndSave(matchId: string, input: PredictionInput): Promise<PredictionEntity> {
    const results = this.runAllModels(input);
    const ensemble = this.ensemblePrediction(Object.values(results));
    return this.savePrediction(matchId, ensemble);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private buildInputFromMatch(match: MatchEntity, latestOdds: OddsEntity | null): PredictionInput {
    const statsHomeXG = match.stats?.homeXG;
    const statsAwayXG = match.stats?.awayXG;

    let homeXG: number;
    let awayXG: number;

    if (statsHomeXG !== undefined && statsAwayXG !== undefined) {
      // Use real xG from live/post-match stats when available.
      homeXG = statsHomeXG;
      awayXG = statsAwayXG;
    } else if (latestOdds?.homeOdds && latestOdds?.drawOdds && latestOdds?.awayOdds) {
      // Derive implied xG from bookmaker odds when real xG is unavailable.
      // Remove bookmaker margin to get clean implied probabilities, then map
      // to an xG range that reflects relative team strength for this match.
      const margin = 1 / latestOdds.homeOdds + 1 / latestOdds.drawOdds + 1 / latestOdds.awayOdds;
      const cleanHome = 1 / latestOdds.homeOdds / margin;
      const cleanAway = 1 / latestOdds.awayOdds / margin;
      homeXG = this.clamp(cleanHome * 3.2, 0.4, 3.5);
      awayXG = this.clamp(cleanAway * 2.8, 0.3, 3.0);
    } else {
      homeXG = 1.35;
      awayXG = 1.1;
    }

    return {
      homeTeam: {
        xG: homeXG,
        attackStrength: this.clamp(homeXG / 1.3, 0.75, 1.4),
        defenseStrength: this.clamp(1.25 / (awayXG + 0.2), 0.75, 1.35),
        last5: match.stats?.homeForm ?? [],
      },
      awayTeam: {
        xG: awayXG,
        attackStrength: this.clamp(awayXG / 1.2, 0.7, 1.35),
        defenseStrength: this.clamp(1.2 / (homeXG + 0.2), 0.75, 1.35),
        last5: match.stats?.awayForm ?? [],
      },
      currentOdds: latestOdds
        ? {
            home: latestOdds.homeOdds,
            draw: latestOdds.drawOdds,
            away: latestOdds.awayOdds,
          }
        : undefined,
    };
  }

  async runAndSaveForMatch(matchId: string): Promise<PredictionEntity> {
    const match = await this.matchesService.findById(matchId);
    const odds = await this.getLatestOddsForMatch(match);
    const input = this.buildInputFromMatch(match, odds);
    return this.runAndSave(matchId, input);
  }

  async recalculatePredictions(
    options: RecalculatePredictionsOptions = {},
  ): Promise<{ total: number; recalculated: number; failed: number; failures: string[] }> {
    const statuses = options.statuses && options.statuses.length > 0
      ? options.statuses
      : ['scheduled', 'live'];
    const limit = options.limit && Number.isFinite(options.limit)
      ? Math.max(1, Math.floor(options.limit))
      : 1000;

    const matches = await this.matchesService.findAll({});
    const selected = matches
      .filter((m) => statuses.includes(m.status))
      .slice(0, limit);

    let recalculated = 0;
    let failed = 0;
    const failures: string[] = [];

    for (const match of selected) {
      try {
        const odds = await this.getLatestOddsForMatch(match);
        await this.runAndSave(match.id, this.buildInputFromMatch(match, odds));
        recalculated += 1;
      } catch (error: unknown) {
        failed += 1;
        failures.push(`${match.id}: ${(error as Error).message}`);
      }
    }

    return {
      total: selected.length,
      recalculated,
      failed,
      failures,
    };
  }

  private toTeamProjection(side: TeamSide, xg: number, baselineCorners: number): TeamProjection {
    const expectedGoals = this.clamp(xg, 0.2, 4.5);
    const expectedShots = this.clamp(expectedGoals * 7.4, 3, 24);
    const expectedShotsOnTarget = this.clamp(expectedGoals * 2.7, 1, 11);
    const expectedCorners = this.clamp(baselineCorners + expectedGoals * 1.6, 1, 14);

    return {
      side,
      expectedGoals,
      expectedShots,
      expectedShotsOnTarget,
      expectedCorners,
    };
  }

  private impliedProbability(decimalOdds?: number): number | null {
    if (!decimalOdds || decimalOdds <= 1) return null;
    return 1 / decimalOdds;
  }

  private async getLatestOddsForMatch(match: MatchEntity): Promise<OddsEntity | null> {
    // Odds ingestion stores fixture external ID in odds.matchId.
    // Match routes use internal Mongo ID, so we try both.
    const externalMatchId = String(match.matchId ?? '');
    if (externalMatchId) {
      const byExternalId = await this.oddsService.getLatestOdds(externalMatchId);
      if (byExternalId) return byExternalId;
    }

    return this.oddsService.getLatestOdds(match.id);
  }

  private detectPreMatchOpportunities(
    prediction: PredictionEntity,
    projectedHome: TeamProjection,
    projectedAway: TeamProjection,
    odds: OddsEntity | null,
  ): BettingOpportunity[] {
    const opportunities: BettingOpportunity[] = [];

    const add1x2Opportunity = (
      selection: string,
      modelProbability: number,
      decimalOdds: number | undefined,
      rationale: string,
    ) => {
      const implied = this.impliedProbability(decimalOdds);
      if (!implied) return;
      const edge = modelProbability - implied;
      if (edge >= 0.04) {
        opportunities.push({
          market: '1X2',
          selection,
          phase: 'pre-match',
          confidence: this.clamp(prediction.confidence + edge, 0.45, 0.98),
          valueEdge: edge,
          rationale,
        });
      }
    };

    add1x2Opportunity('Home Win', prediction.homeProbability, odds?.homeOdds, 'Model indicates home win probability above market implied probability.');
    add1x2Opportunity('Draw', prediction.drawProbability, odds?.drawOdds, 'Model indicates draw probability above market implied probability.');
    add1x2Opportunity('Away Win', prediction.awayProbability, odds?.awayOdds, 'Model indicates away win probability above market implied probability.');

    const totalGoals = projectedHome.expectedGoals + projectedAway.expectedGoals;
    const totalCorners = projectedHome.expectedCorners + projectedAway.expectedCorners;

    if (prediction.overProbability >= 0.58 || totalGoals >= 2.8) {
      opportunities.push({
        market: 'Goals',
        selection: 'Over 2.5 Goals',
        phase: 'pre-match',
        confidence: this.clamp(Math.max(prediction.overProbability, 0.52), 0.5, 0.95),
        rationale: 'Projected goals and model over probability support an over goals entry.',
      });
    }

    if (totalCorners >= 9.5) {
      opportunities.push({
        market: 'Corners',
        selection: 'Over 8.5 Corners',
        phase: 'pre-match',
        confidence: this.clamp(0.52 + (totalCorners - 9.5) * 0.04, 0.5, 0.9),
        rationale: 'Combined attacking projections suggest a high corner count environment.',
      });
    }

    const cornerGap = projectedHome.expectedCorners - projectedAway.expectedCorners;
    if (Math.abs(cornerGap) >= 1.3) {
      const side = cornerGap > 0 ? 'Home' : 'Away';
      opportunities.push({
        market: 'Race to Corners',
        selection: `${side} - Race to 5 Corners`,
        phase: 'pre-match',
        confidence: this.clamp(0.54 + Math.abs(cornerGap) * 0.07, 0.5, 0.9),
        rationale: 'Projected corner supremacy supports race-to-corners markets.',
      });
    }

    if (projectedHome.expectedShotsOnTarget >= 4.5) {
      opportunities.push({
        market: 'Team Shots on Target',
        selection: 'Home Over 3.5 Shots on Target',
        phase: 'pre-match',
        confidence: this.clamp(0.53 + (projectedHome.expectedShotsOnTarget - 4.5) * 0.05, 0.5, 0.9),
        rationale: 'Home attacking profile points to sustained on-target pressure.',
      });
    }

    if (projectedAway.expectedShotsOnTarget >= 4.2) {
      opportunities.push({
        market: 'Team Shots on Target',
        selection: 'Away Over 3.5 Shots on Target',
        phase: 'pre-match',
        confidence: this.clamp(0.52 + (projectedAway.expectedShotsOnTarget - 4.2) * 0.05, 0.5, 0.88),
        rationale: 'Away profile supports enough attacking volume for team shots-on-target lines.',
      });
    }

    return opportunities;
  }

  private detectLiveOpportunities(
    match: MatchEntity,
    prediction: PredictionEntity,
    projectedHome: TeamProjection,
    projectedAway: TeamProjection,
  ): BettingOpportunity[] {
    if (match.status !== 'live') return [];

    const opportunities: BettingOpportunity[] = [];
    const homeScore = match.homeScore ?? 0;
    const awayScore = match.awayScore ?? 0;
    const totalGoalsNow = homeScore + awayScore;

    const favoriteSide: TeamSide = prediction.homeProbability >= prediction.awayProbability ? 'home' : 'away';
    const favoriteProb = favoriteSide === 'home' ? prediction.homeProbability : prediction.awayProbability;
    const underdogProb = favoriteSide === 'home' ? prediction.awayProbability : prediction.homeProbability;
    const probGap = favoriteProb - underdogProb;

    const favoriteTrailing =
      (favoriteSide === 'home' && homeScore < awayScore) ||
      (favoriteSide === 'away' && awayScore < homeScore);
    const favoriteLeading =
      (favoriteSide === 'home' && homeScore > awayScore) ||
      (favoriteSide === 'away' && awayScore > homeScore);

    // Always: recommend the model-favored side when the edge is meaningful
    if (probGap >= 0.08) {
      const sideLabel = favoriteSide === 'home' ? 'Home Win' : 'Away Win';
      opportunities.push({
        market: '1X2',
        selection: sideLabel,
        phase: 'live',
        confidence: this.clamp(favoriteProb + 0.04, 0.5, 0.95),
        rationale: `Model-favored side has a ${Math.round(probGap * 100)}% probability edge in this live match.`,
      });
    }

    // 0-0 match: recommend over 0.5 goals (almost always value when score is blank)
    if (totalGoalsNow === 0) {
      const overProb = this.clamp(0.75 + (projectedHome.expectedGoals + projectedAway.expectedGoals - 2.5) * 0.06, 0.6, 0.95);
      opportunities.push({
        market: 'Live Goals',
        selection: 'Over 0.5 Goals',
        phase: 'live',
        confidence: overProb,
        rationale: 'Match is still goalless — high probability of at least one goal based on attacking projections.',
      });
    }

    // Open game / goal momentum: over on next line
    if (totalGoalsNow >= 1) {
      const line = totalGoalsNow + 0.5;
      opportunities.push({
        market: 'Live Goals',
        selection: `Over ${line} Goals`,
        phase: 'live',
        confidence: this.clamp(0.52 + totalGoalsNow * 0.07, 0.5, 0.9),
        rationale: 'Open game state with goals scored often sustains chance creation and transition play.',
      });
    }

    // Corners opportunity based on projected volume (independent of score)
    const projectedCorners = projectedHome.expectedCorners + projectedAway.expectedCorners;
    if (projectedCorners >= 8.5) {
      opportunities.push({
        market: 'Live Corners',
        selection: 'Over 8.5 Corners',
        phase: 'live',
        confidence: this.clamp(0.52 + (projectedCorners - 8.5) * 0.04, 0.5, 0.9),
        rationale: 'High combined corner projection supports an over corners entry even in a low-scoring match.',
      });
    }

    // Favorite trailing: extra pressure-based opportunities
    if (favoriteTrailing) {
      const sideLabel = favoriteSide === 'home' ? 'Home' : 'Away';
      opportunities.push({
        market: 'Live Corners',
        selection: `${sideLabel} Next Corner / Over Team Corners`,
        phase: 'live',
        confidence: this.clamp(prediction.confidence + 0.08, 0.55, 0.94),
        rationale: 'Favorite is trailing live and tends to increase attacking pressure, boosting corner potential.',
      });

      opportunities.push({
        market: 'Race to Corners (Live)',
        selection: `${sideLabel} - Race to Next 3 Corners`,
        phase: 'live',
        confidence: this.clamp(0.58 + probGap, 0.55, 0.93),
        rationale: 'Trailing favorite often dominates late territorial pressure, valuable for race-to-corners entries.',
      });

      opportunities.push({
        market: 'Live Shots on Target',
        selection: `${sideLabel} Over Team Shots on Target`,
        phase: 'live',
        confidence: this.clamp(0.56 + (favoriteSide === 'home' ? projectedHome.expectedShotsOnTarget : projectedAway.expectedShotsOnTarget) * 0.03, 0.55, 0.92),
        rationale: 'Trailing favorite setup usually increases shot volume and shot-on-target frequency.',
      });
    }

    // Favorite leading with strong pre-match edge: backing them to win remains value
    if (favoriteLeading && probGap >= 0.15) {
      const sideLabel = favoriteSide === 'home' ? 'Home Win' : 'Away Win';
      // Only push if not already added by the generic block above
      if (!opportunities.some((o) => o.market === '1X2' && o.selection === sideLabel)) {
        opportunities.push({
          market: '1X2',
          selection: sideLabel,
          phase: 'live',
          confidence: this.clamp(favoriteProb + 0.06, 0.55, 0.96),
          rationale: 'Strong favorite is also leading live — model edge and scoreline align.',
        });
      }
    }

    return opportunities;
  }

  private evaluateOpportunityResult(match: MatchEntity, opportunity: BettingOpportunity): OpportunityResult {
    return this.evaluateOpportunityResultBySelection(match, opportunity.market, opportunity.selection);
  }

  private evaluateOpportunityResultBySelection(
    match: MatchEntity,
    market: string,
    selection: string,
  ): OpportunityResult {
    if (match.status !== 'finished') return 'pending';

    const home = match.homeScore ?? 0;
    const away = match.awayScore ?? 0;
    const totalGoals = home + away;
    const homeCorners = match.stats?.homeCorners;
    const awayCorners = match.stats?.awayCorners;
    const homeSot = match.stats?.homeShotsOnTarget;
    const awaySot = match.stats?.awayShotsOnTarget;

    if (market === '1X2') {
      if (selection === 'Home Win') return home > away ? 'won' : 'lost';
      if (selection === 'Away Win') return away > home ? 'won' : 'lost';
      if (selection === 'Draw') return home === away ? 'won' : 'lost';
    }

    if (market === 'Goals' && selection === 'Over 2.5 Goals') {
      return totalGoals > 2.5 ? 'won' : 'lost';
    }

    if (market === 'Live Goals') {
      // Legacy hardcoded selection
      if (selection === 'Over Live Goal Line') return totalGoals >= 3 ? 'won' : 'lost';
      // Generic "Over N.5 Goals" / "Over N Goals" selection
      const lineMatch = selection.match(/^over\s+(\d+(?:\.\d+)?)/i);
      if (lineMatch) {
        const line = Number(lineMatch[1]);
        return totalGoals > line ? 'won' : 'lost';
      }
    }

    if (market === 'Corners') {
      if (homeCorners === undefined || awayCorners === undefined) return 'pending';
      const totalCorners = homeCorners + awayCorners;
      if (selection === 'Over 8.5 Corners') {
        return totalCorners > 8.5 ? 'won' : 'lost';
      }
    }

    if (market === 'Race to Corners') {
      if (homeCorners === undefined || awayCorners === undefined) return 'pending';
      if (selection.startsWith('Home')) {
        return homeCorners >= 5 && homeCorners > awayCorners ? 'won' : 'lost';
      }
      if (selection.startsWith('Away')) {
        return awayCorners >= 5 && awayCorners > homeCorners ? 'won' : 'lost';
      }
    }

    if (market === 'Race to Corners (Live)') {
      if (homeCorners === undefined || awayCorners === undefined) return 'pending';
      if (selection.startsWith('Home')) {
        return homeCorners - awayCorners >= 2 ? 'won' : 'lost';
      }
      if (selection.startsWith('Away')) {
        return awayCorners - homeCorners >= 2 ? 'won' : 'lost';
      }
    }

    if (market === 'Live Corners') {
      if (homeCorners === undefined || awayCorners === undefined) return 'pending';
      const totalCorners = homeCorners + awayCorners;
      // Generic "Over N.5 Corners" selection
      const lineMatch = selection.match(/^over\s+(\d+(?:\.\d+)?)\s+corners/i);
      if (lineMatch) {
        const line = Number(lineMatch[1]);
        return totalCorners > line ? 'won' : 'lost';
      }
      if (selection.startsWith('Home')) {
        return homeCorners >= 5 || homeCorners > awayCorners ? 'won' : 'lost';
      }
      if (selection.startsWith('Away')) {
        return awayCorners >= 5 || awayCorners > homeCorners ? 'won' : 'lost';
      }
    }

    if (market === 'Team Shots on Target') {
      if (homeSot === undefined || awaySot === undefined) return 'pending';
      if (selection === 'Home Over 3.5 Shots on Target') return homeSot > 3.5 ? 'won' : 'lost';
      if (selection === 'Away Over 3.5 Shots on Target') return awaySot > 3.5 ? 'won' : 'lost';
    }

    if (market === 'Live Shots on Target') {
      if (homeSot === undefined || awaySot === undefined) return 'pending';
      if (selection.startsWith('Home')) return homeSot > 3.5 ? 'won' : 'lost';
      if (selection.startsWith('Away')) return awaySot > 3.5 ? 'won' : 'lost';
    }

    return 'pending';
  }

  private async reconcileOpportunityRows(rows: PendingOpportunityRow[]): Promise<{ checked: number; updated: number }> {
    if (rows.length === 0) return { checked: 0, updated: 0 };

    const matchCache = new Map<string, MatchEntity | null>();
    let updated = 0;

    for (const row of rows) {
      if (!matchCache.has(row.matchId)) {
        try {
          const match = await this.matchesService.findById(row.matchId);
          matchCache.set(row.matchId, match);
        } catch {
          matchCache.set(row.matchId, null);
        }
      }

      const match = matchCache.get(row.matchId);
      if (!match) continue;

      const result = this.evaluateOpportunityResultBySelection(match, row.market, row.selection);
      if (result !== row.result || row.matchStatus !== match.status) {
        await this.opportunitiesRepository.updateResult(row._id, result, match.status);
        updated += 1;
      }
    }

    return { checked: rows.length, updated };
  }

  async reconcilePendingOpportunities(limit = 500): Promise<{ checked: number; updated: number }> {
    const rows: PendingOpportunityRow[] = await this.opportunitiesRepository.findPending(limit);
    return this.reconcileOpportunityRows(rows);
  }

  async reconcileLiveOpportunities(limit = 1500): Promise<{ checked: number; updated: number }> {
    const rows: PendingOpportunityRow[] = await this.opportunitiesRepository.findPendingLive(limit);
    return this.reconcileOpportunityRows(rows);
  }

  private toOpportunityDocs(match: MatchEntity, insights: MatchPredictionInsights): CreatePredictionOpportunityInput[] {
    return insights.opportunities.map((opportunity) => ({
      matchId: insights.matchId,
      matchStartTime: insights.matchStartTime,
      homeTeamName: insights.homeTeamName,
      awayTeamName: insights.awayTeamName,
      leagueId: String(match.league?.id ?? ''),
      leagueName: match.league?.name,
      leagueCountry: match.league?.country,
      isInternational: this.isInternationalCompetition(match),
      market: opportunity.market,
      selection: opportunity.selection,
      phase: opportunity.phase,
      confidence: opportunity.confidence,
      valueEdge: opportunity.valueEdge,
      rationale: opportunity.rationale,
      matchStatus: insights.matchStatus,
      result: this.evaluateOpportunityResult(match, opportunity),
      generatedAt: insights.generatedAt,
      projectedTotals: {
        goals: insights.projectedTotals.goals,
        shots: insights.projectedTotals.shots,
        shotsOnTarget: insights.projectedTotals.shotsOnTarget,
        corners: insights.projectedTotals.corners,
      },
      projectedHome: {
        expectedGoals: insights.projectedTeams.home.expectedGoals,
        expectedShots: insights.projectedTeams.home.expectedShots,
        expectedShotsOnTarget: insights.projectedTeams.home.expectedShotsOnTarget,
        expectedCorners: insights.projectedTeams.home.expectedCorners,
      },
      projectedAway: {
        expectedGoals: insights.projectedTeams.away.expectedGoals,
        expectedShots: insights.projectedTeams.away.expectedShots,
        expectedShotsOnTarget: insights.projectedTeams.away.expectedShotsOnTarget,
        expectedCorners: insights.projectedTeams.away.expectedCorners,
      },
      winProbabilities: {
        home: insights.winProbabilities.home,
        draw: insights.winProbabilities.draw,
        away: insights.winProbabilities.away,
      },
    }));
  }

  async getPredictionInsights(matchId: string): Promise<MatchPredictionInsights> {
    const match = await this.matchesService.findById(matchId);
    const odds = await this.getLatestOddsForMatch(match);

    let prediction = await this.getPrediction(matchId);
    // Refresh live predictions and also refresh when market odds are available.
    if (!prediction || match.status === 'live' || Boolean(odds)) {
      prediction = await this.runAndSave(matchId, this.buildInputFromMatch(match, odds));
    }

    const projectedHome = this.toTeamProjection('home', match.stats?.homeXG ?? (1 + prediction.homeProbability * 1.7), 3.4);
    const projectedAway = this.toTeamProjection('away', match.stats?.awayXG ?? (0.9 + prediction.awayProbability * 1.6), 3.0);

    const projectedTotals = {
      goals: this.clamp(projectedHome.expectedGoals + projectedAway.expectedGoals, 0.4, 7),
      shots: this.clamp(projectedHome.expectedShots + projectedAway.expectedShots, 6, 40),
      shotsOnTarget: this.clamp(projectedHome.expectedShotsOnTarget + projectedAway.expectedShotsOnTarget, 2, 20),
      corners: this.clamp(projectedHome.expectedCorners + projectedAway.expectedCorners, 3, 20),
    };

    const preMatch = this.detectPreMatchOpportunities(prediction, projectedHome, projectedAway, odds);
    const live = this.detectLiveOpportunities(match, prediction, projectedHome, projectedAway);

    const insights: MatchPredictionInsights = {
      matchId,
      matchStartTime: match.startTime,
      homeTeamName: match.homeTeam?.name,
      awayTeamName: match.awayTeam?.name,
      matchStatus: match.status,
      generatedAt: new Date(),
      winProbabilities: {
        home: prediction.homeProbability,
        draw: prediction.drawProbability,
        away: prediction.awayProbability,
      },
      projectedTeams: {
        home: projectedHome,
        away: projectedAway,
      },
      projectedTotals,
      opportunities: [...preMatch, ...live],
    };

    await this.opportunitiesRepository.createMany(this.toOpportunityDocs(match, insights));
    return insights;
  }

  async getTodayOpportunities(limit = 20): Promise<MatchPredictionInsights[]> {
    return this.getTodayOpportunitiesFiltered(limit, {});
  }

  /**
   * Every 5 minutes: detect all live matches and auto-generate/persist
   * opportunities for each one so the live feed stays up to date regardless
   * of whether any client explicitly requested predictions.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async autoGenerateLiveOpportunities(): Promise<void> {
    try {
      const reconciled = await this.reconcileLiveOpportunities(2000);
      if (reconciled.updated > 0) {
        this.logger.log(`[LiveOpportunities] Reconciled ${reconciled.updated}/${reconciled.checked} pending live rows`);
      }

      const liveMatches = await this.matchesService.findAll({ status: 'live' });
      if (liveMatches.length === 0) return;

      this.logger.log(`[LiveOpportunities] Auto-generating for ${liveMatches.length} live match(es)`);

      for (const match of liveMatches) {
        try {
          await this.getPredictionInsights(match.id);
        } catch (err: unknown) {
          this.logger.warn(`[LiveOpportunities] Skipped match ${match.id}: ${(err as Error).message}`);
        }
      }

      this.logger.log(`[LiveOpportunities] Done`);
    } catch (err: unknown) {
      this.logger.error(`[LiveOpportunities] Cron failed: ${(err as Error).message}`);
    }
  }

  private normalizeList(values?: string[]): string[] {
    if (!values || values.length === 0) return [];
    return values
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }

  private isInternationalCompetition(match: MatchEntity): boolean {
    const country = (match.league?.country ?? '').toLowerCase();
    const leagueName = (match.league?.name ?? '').toLowerCase();

    if (country.includes('world') || country.includes('international') || country.includes('europe')) {
      return true;
    }

    const internationalKeywords = [
      'champions league',
      'europa league',
      'conference league',
      'nations league',
      'world cup',
      'euro',
      'copa america',
      'libertadores',
      'sudamericana',
      'club world cup',
      'afc champions league',
      'caf champions league',
    ];

    return internationalKeywords.some((k) => leagueName.includes(k));
  }

  private applyTodayFilters(matches: MatchEntity[], filters: TodayOpportunitiesFilters): MatchEntity[] {
    const leagueIds = new Set(this.normalizeList(filters.leagueIds));
    const countries = new Set(this.normalizeList(filters.countries).map((c) => c.toLowerCase()));

    return matches.filter((m) => {
      if (leagueIds.size > 0 && !leagueIds.has(String(m.league?.id ?? ''))) {
        return false;
      }

      if (countries.size > 0) {
        const country = String(m.league?.country ?? '').toLowerCase();
        if (!countries.has(country)) {
          return false;
        }
      }

      if (filters.internationalOnly && !this.isInternationalCompetition(m)) {
        return false;
      }

      return true;
    });
  }

  async getTodayOpportunitiesFiltered(
    limit = 20,
    filters: TodayOpportunitiesFilters = {},
  ): Promise<MatchPredictionInsights[]> {
    const matches = await this.matchesService.findAll({});
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const todayMatches = matches
      .filter((m) => {
        const t = new Date(m.startTime).getTime();
        return t >= start.getTime() && t <= end.getTime();
      })
      .filter((m) => m.status === 'scheduled' || m.status === 'live');

    const filteredMatches = this.applyTodayFilters(todayMatches, filters)
      .slice(0, limit);

    return Promise.all(filteredMatches.map((m) => this.getPredictionInsights(m.id)));
  }

  async getLiveOpportunities(limit = 50, filters: LiveOpportunityFilters = {}): Promise<PredictionOpportunity[]> {
    // Generate/refresh insights for all currently live matches so the feed
    // is always up-to-date, even if the background cron hasn't fired yet.
    try {
      const liveMatches = await this.matchesService.findAll({ status: 'live' });
      await Promise.allSettled(
        liveMatches.slice(0, 20).map((m) => this.getPredictionInsights(m.id)),
      );
    } catch {
      // non-fatal: still return whatever is already persisted
    }
    await this.reconcileLiveOpportunities(2000);
    return this.opportunitiesRepository.findLatestLive(limit, filters);
  }

  async getOpportunityHistory(matchId: string, limit = 100): Promise<PredictionOpportunity[]> {
    await this.reconcilePendingOpportunities(400);
    return this.opportunitiesRepository.findByMatchId(matchId, limit);
  }

  async getOpportunityMarketStats(): Promise<OpportunityMarketStats[]> {
    await this.reconcilePendingOpportunities(1000);
    return this.opportunitiesRepository.getMarketStats();
  }
}
