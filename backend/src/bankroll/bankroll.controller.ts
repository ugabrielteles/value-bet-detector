import { Controller, Get, Put, Body, Query, UseGuards } from '@nestjs/common';
import { BankrollService } from './bankroll.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { UpdateBankrollDto } from './application/dtos/update-bankroll.dto';
import { UserEntity } from '../auth/domain/entities/user.entity';

@Controller('bankroll')
@UseGuards(JwtAuthGuard)
export class BankrollController {
  constructor(private readonly bankrollService: BankrollService) {}

  @Get()
  async getBankroll(@CurrentUser() user: UserEntity) {
    return this.bankrollService.getBankroll(user.id);
  }

  @Put()
  async updateBankroll(@CurrentUser() user: UserEntity, @Body() dto: UpdateBankrollDto) {
    return this.bankrollService.updateBankroll(user.id, dto);
  }

  @Get('stake-recommendation')
  async getStakeRecommendation(
    @CurrentUser() user: UserEntity,
    @Query('modelProbability') modelProbability: string,
    @Query('decimalOdds') decimalOdds: string,
  ) {
    return this.bankrollService.getStakeRecommendation(user.id, +modelProbability, +decimalOdds);
  }
}
