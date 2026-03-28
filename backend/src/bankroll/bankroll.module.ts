import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BankrollService } from './bankroll.service';
import { BankrollController } from './bankroll.controller';
import { BankrollRepository } from './infrastructure/repositories/bankroll.repository';
import { Bankroll, BankrollSchema } from './infrastructure/models/bankroll.model';

@Module({
  imports: [MongooseModule.forFeature([{ name: Bankroll.name, schema: BankrollSchema }])],
  controllers: [BankrollController],
  providers: [BankrollService, BankrollRepository],
  exports: [BankrollService],
})
export class BankrollModule {}
