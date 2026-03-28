import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OddsService } from './odds.service';
import { OddsController } from './odds.controller';
import { OddsRepository } from './infrastructure/repositories/odds.repository';
import { OddsHistory, OddsHistorySchema } from './infrastructure/models/odds-history.model';

@Module({
  imports: [MongooseModule.forFeature([{ name: OddsHistory.name, schema: OddsHistorySchema }])],
  controllers: [OddsController],
  providers: [OddsService, OddsRepository],
  exports: [OddsService],
})
export class OddsModule {}
