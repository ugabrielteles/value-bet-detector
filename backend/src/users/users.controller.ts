import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { UpdateUserDto } from './application/dtos/update-user.dto';
import { UserEntity } from './domain/entities/user.entity';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser() user: UserEntity) {
    return this.usersService.findById(user.id);
  }

  @Put('me')
  async updateMe(@CurrentUser() user: UserEntity, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.id, dto);
  }
}
