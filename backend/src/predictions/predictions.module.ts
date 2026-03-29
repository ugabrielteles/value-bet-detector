import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PredictionsService } from './predictions.service';
import { PredictionsController } from './predictions.controller';
import { PredictionsRepository } from './infrastructure/repositories/predictions.repository';
import { Prediction, PredictionSchema } from './infrastructure/models/prediction.model';
import { MatchesModule } from '../matches/matches.module';
import { OddsModule } from '../odds/odds.module';
import {
  PredictionOpportunity,
  PredictionOpportunitySchema,
} from './infrastructure/models/prediction-opportunity.model';
import { PredictionOpportunitiesRepository } from './infrastructure/repositories/prediction-opportunities.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Prediction.name, schema: PredictionSchema },
      { name: PredictionOpportunity.name, schema: PredictionOpportunitySchema },
    ]),
    MatchesModule,
    OddsModule,
  ],
  controllers: [PredictionsController],
  providers: [PredictionsService, PredictionsRepository, PredictionOpportunitiesRepository],
  exports: [PredictionsService],
})
export class PredictionsModule {}
