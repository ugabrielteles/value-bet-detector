import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ValueBetEntity } from '../../value-bets/domain/entities/value-bet.entity';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken = process.env.TELEGRAM_BOT_TOKEN;
  private readonly chatId = process.env.TELEGRAM_CHAT_ID;

  async sendValueBetAlert(bet: ValueBetEntity): Promise<void> {
    if (!this.botToken || !this.chatId) {
      this.logger.warn('Telegram not configured, skipping notification');
      return;
    }

    const message =
      `🎯 *Value Bet Detected!*\n` +
      `📊 Classification: *${bet.classification}*\n` +
      `⚽ Market: ${bet.market} - ${bet.outcome}\n` +
      `📈 Model Prob: ${(bet.modelProbability * 100).toFixed(1)}%\n` +
      `💰 Odds: ${bet.bookmakerOdds}\n` +
      `✨ Value: ${(bet.value * 100).toFixed(1)}%\n` +
      `🏪 Bookmaker: ${bet.bookmaker}`;

    try {
      await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'Markdown',
      });
    } catch (error: unknown) {
      this.logger.error('Failed to send Telegram notification', (error as Error).message);
    }
  }
}
