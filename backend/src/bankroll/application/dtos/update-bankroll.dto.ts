import { IsEnum, IsNumber, IsOptional, IsBoolean, IsString, Min, Max } from 'class-validator';

export class UpdateBankrollDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialBankroll?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentBankroll?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(10)
  minBetPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(25)
  maxBetPercentage?: number;

  @IsOptional()
  @IsEnum(['flat', 'kelly', 'percentage'])
  strategy?: 'flat' | 'kelly' | 'percentage';

  @IsOptional()
  @IsBoolean()
  useKellyCriterion?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1)
  kellyFraction?: number;

  @IsOptional()
  @IsBoolean()
  stopLossEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  stopLossPercentage?: number;

  @IsOptional()
  currency?: string;

  // Auto-bet settings
  @IsOptional()
  @IsBoolean()
  autoBetEnabled?: boolean;

  @IsOptional()
  @IsString()
  autoBetProvider?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  autoBetMinValue?: number;

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH'])
  autoBetMinClassification?: 'LOW' | 'MEDIUM' | 'HIGH';

  @IsOptional()
  @IsNumber()
  @Min(1)
  autoBetMaxDailyBets?: number;

  @IsOptional()
  @IsBoolean()
  autoBetDryRun?: boolean;
}
