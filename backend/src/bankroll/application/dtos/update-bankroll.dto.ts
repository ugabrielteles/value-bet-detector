import { IsEnum, IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';

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
}
