import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { BookmakerProvider } from '../../domain/entities/bookmaker-credentials.entity';

export class UpsertBookmakerCredentialsDto {
  @IsEnum(['betano', 'bet365', 'betfair', 'bwin', 'unibet', 'other'])
  provider: BookmakerProvider;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  accountLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  loginUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  twoFactorSecret?: string;
}
