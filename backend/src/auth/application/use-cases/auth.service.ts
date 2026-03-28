import { Injectable, Inject, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { LoginDto } from '../dtos/login.dto';
import { RegisterDto } from '../dtos/register.dto';
import { UserEntity } from '../../domain/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ accessToken: string; refreshToken: string; user: Partial<UserEntity> }> {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.userRepository.create({
      email: dto.email,
      username: dto.username,
      passwordHash,
      roles: ['user'],
      isActive: true,
    });

    const tokens = this.generateTokens(user);
    return { ...tokens, user: this.sanitize(user) };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string; user: Partial<UserEntity> }> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isActive) throw new UnauthorizedException('Account is disabled');

    const tokens = this.generateTokens(user);
    return { ...tokens, user: this.sanitize(user) };
  }

  async validateUser(payload: { sub: string; email: string }): Promise<UserEntity> {
    const user = await this.userRepository.findById(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedException();
    return user;
  }

  generateTokens(user: UserEntity): { accessToken: string; refreshToken: string } {
    const payload = { sub: user.id, email: user.email, roles: user.roles };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '30d' });
    return { accessToken, refreshToken };
  }

  async refreshToken(token: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.userRepository.findById(payload.sub);
      if (!user) throw new UnauthorizedException();
      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private sanitize(user: UserEntity): Partial<UserEntity> {
    const { passwordHash, ...rest } = user as UserEntity & { passwordHash: string };
    void passwordHash;
    return rest;
  }
}
