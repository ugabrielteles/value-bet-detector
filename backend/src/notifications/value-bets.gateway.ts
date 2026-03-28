import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { ValueBetEntity } from '../value-bets/domain/entities/value-bet.entity';
import { OddsEntity } from '../odds/domain/entities/odds.entity';

@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL || '*' } })
export class ValueBetsGateway {
  @WebSocketServer()
  server: Server;

  emitValueBetDetected(bet: ValueBetEntity): void {
    this.server.emit('valueBetDetected', bet);
  }

  emitOddsUpdated(matchId: string, odds: OddsEntity): void {
    this.server.emit('oddsUpdated', { matchId, odds });
  }

  emitSteamAlert(alert: OddsEntity): void {
    this.server.emit('steamAlert', alert);
  }
}
