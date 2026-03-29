import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RunBetanoBetDto {
	@IsString()
	@MaxLength(500)
	eventUrl: string;

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
}
