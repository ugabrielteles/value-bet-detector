import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { UserEntity } from '../auth/domain/entities/user.entity';
import { BookmakerCredentialsService } from './bookmaker-credentials.service';
import { UpsertBookmakerCredentialsDto } from './application/dtos/upsert-bookmaker-credentials.dto';

@Controller('bookmaker-credentials')
@UseGuards(JwtAuthGuard)
export class BookmakerCredentialsController {
  constructor(private readonly service: BookmakerCredentialsService) {}

  @Get('providers')
  getSupportedProviders() {
    return this.service.getSupportedProviders();
  }

  @Get()
  list(@CurrentUser() user: UserEntity) {
    return this.service.listForUser(user.id);
  }

  @Post()
  upsert(@CurrentUser() user: UserEntity, @Body() dto: UpsertBookmakerCredentialsDto) {
    return this.service.upsertForUser(user.id, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    await this.service.removeForUser(user.id, id);
    return { ok: true };
  }
}
