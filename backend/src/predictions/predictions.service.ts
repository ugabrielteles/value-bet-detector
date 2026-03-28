import { Injectable } from '@nestjs/common';
import { PoissonModel } from '../application/models/poisson.model';
import { LogisticRegressionModel } from '../application/models/logistic-regression.model';
import { XGBoostModel } from '../application/models/xgboost.model';
import { PredictionsRepository } from './infrastructure/repositories/predictions.repository';
import { PredictionInput, PredictionResult } from './domain/interfaces/prediction-model.interface';
import { PredictionEntity } from './domain/entities/prediction.entity';

@Injectable()
export class PredictionsService {
  private readonly poissonModel = new PoissonModel();
  private readonly logisticModel = new LogisticRegressionModel();
  private readonly xgboostModel = new XGBoostModel();

  constructor(private readonly predictionsRepository: PredictionsRepository) {}

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
}
