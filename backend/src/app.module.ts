import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MatchesModule } from './matches/matches.module';
import { OddsModule } from './odds/odds.module';
import { PredictionsModule } from './predictions/predictions.module';
import { ValueBetsModule } from './value-bets/value-bets.module';
import { DataIngestionModule } from './data-ingestion/data-ingestion.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BankrollModule } from './bankroll/bankroll.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SimulatorModule } from './simulator/simulator.module';
import { BookmakerCredentialsModule } from './bookmaker-credentials/bookmaker-credentials.module';
import { BetAutomationModule } from './bet-automation/bet-automation.module';
import { AutoBetsModule } from './auto-bets/auto-bets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/value-bet-detector'),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    MatchesModule,
    OddsModule,
    PredictionsModule,
    ValueBetsModule,
    DataIngestionModule,
    NotificationsModule,
    BankrollModule,
    AnalyticsModule,
    SimulatorModule,
    BookmakerCredentialsModule,
    BetAutomationModule,
    AutoBetsModule,
  ],
})
export class AppModule {}
