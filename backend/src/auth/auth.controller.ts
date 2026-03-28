import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './application/use-cases/auth.service';
import { LoginDto } from './application/dtos/login.dto';
import { RegisterDto } from './application/dtos/register.dto';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { UserEntity } from './domain/entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: UserEntity) {
    const { passwordHash, ...rest } = user as UserEntity & { passwordHash: string };
    void passwordHash;
    return rest;
  }
}
