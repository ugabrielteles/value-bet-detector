import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { BookmakerProvider } from '../../../bookmaker-credentials/domain/entities/bookmaker-credentials.entity';

export class RunBookmakerAutomationDto {
  @IsEnum(['betano', 'bet365', 'betfair', 'bwin', 'unibet', 'other'])
  provider: BookmakerProvider;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  eventUrl?: string;

  @IsString()
  @MaxLength(180)
  selectionText: string;

  @IsNumber()
  @Min(0.1)
  stake: number;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsBoolean()
  confirmRealBet?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  homeTeamName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  awayTeamName?: string;
}
