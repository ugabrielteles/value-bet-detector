import { IsString, IsNumber, IsEnum, IsOptional, IsBoolean, Min } from 'class-validator';

export class RunSimulationDto {
  @IsString()
  name: string;

  @IsNumber()
  @Min(1)
  initialBankroll: number;

  @IsEnum(['flat', 'kelly', 'percentage'])
  strategy: 'flat' | 'kelly' | 'percentage';

  @IsOptional()
  @IsNumber()
  @Min(0)
  flatStakeAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  percentageStake?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  kellyFraction?: number;

  @IsOptional()
  @IsNumber()
  minOdds?: number;

  @IsOptional()
  @IsNumber()
  maxOdds?: number;

  @IsOptional()
  @IsNumber()
  minValue?: number;

  @IsOptional()
  @IsBoolean()
  onlyHighValue?: boolean;

  @IsOptional()
  dateFrom?: Date;

  @IsOptional()
  dateTo?: Date;
}
