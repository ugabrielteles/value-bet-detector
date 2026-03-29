import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class UpdateAutoOutcomeDto {
  @IsEnum(['won', 'lost', 'void'])
  outcome: 'won' | 'lost' | 'void';

  /** Net winnings (positive number). Leave empty for 'lost'/'void'. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  winnings?: number;

  @IsOptional()
  @IsString()
  betSlipId?: string;
}
