import { IsEnum } from 'class-validator';
import { BookmakerProvider } from '../../../bookmaker-credentials/domain/entities/bookmaker-credentials.entity';

export class StartManualSessionDto {
  @IsEnum(['betano', 'bet365'])
  provider: Extract<BookmakerProvider, 'betano' | 'bet365'>;
}
