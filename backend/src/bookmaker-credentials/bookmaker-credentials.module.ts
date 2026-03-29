import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BookmakerCredentialsController } from './bookmaker-credentials.controller';
import { BookmakerCredentialsService } from './bookmaker-credentials.service';
import { BookmakerCredentialsRepository } from './infrastructure/repositories/bookmaker-credentials.repository';
import {
  BookmakerCredentials,
  BookmakerCredentialsSchema,
} from './infrastructure/models/bookmaker-credentials.model';

@Module({
  imports: [MongooseModule.forFeature([{ name: BookmakerCredentials.name, schema: BookmakerCredentialsSchema }])],
  controllers: [BookmakerCredentialsController],
  providers: [BookmakerCredentialsService, BookmakerCredentialsRepository],
  exports: [BookmakerCredentialsService],
})
export class BookmakerCredentialsModule {}
