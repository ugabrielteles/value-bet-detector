import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';
import { MatchesRepository } from './infrastructure/repositories/matches.repository';
import { Match, MatchSchema } from './infrastructure/models/match.model';

@Module({
  imports: [MongooseModule.forFeature([{ name: Match.name, schema: MatchSchema }])],
  controllers: [MatchesController],
  providers: [MatchesService, MatchesRepository],
  exports: [MatchesService],
})
export class MatchesModule {}
