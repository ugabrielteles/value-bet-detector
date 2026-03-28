import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PredictionsService } from './predictions.service';
import { PredictionsController } from './predictions.controller';
import { PredictionsRepository } from './infrastructure/repositories/predictions.repository';
import { Prediction, PredictionSchema } from './infrastructure/models/prediction.model';

@Module({
  imports: [MongooseModule.forFeature([{ name: Prediction.name, schema: PredictionSchema }])],
  controllers: [PredictionsController],
  providers: [PredictionsService, PredictionsRepository],
  exports: [PredictionsService],
})
export class PredictionsModule {}
