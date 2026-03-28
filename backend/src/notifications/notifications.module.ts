import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { ValueBetsGateway } from './value-bets.gateway';

@Module({
  providers: [TelegramService, ValueBetsGateway],
  exports: [TelegramService, ValueBetsGateway],
})
export class NotificationsModule {}
