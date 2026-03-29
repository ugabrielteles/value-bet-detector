import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UpsertBookmakerCredentialsDto } from './application/dtos/upsert-bookmaker-credentials.dto';
import { BookmakerCredentialsRepository } from './infrastructure/repositories/bookmaker-credentials.repository';
import { BookmakerProvider } from './domain/entities/bookmaker-credentials.entity';
import { decryptSecret, encryptSecret } from '../shared/utils/crypto-secrets.utils';

export interface BookmakerCredentialsSafeView {
  id: string;
  provider: BookmakerProvider;
  accountLabel?: string;
  loginUrl?: string;
  hasUsername: boolean;
  hasPassword: boolean;
  hasTwoFactorSecret: boolean;
  updatedAt: Date;
  createdAt: Date;
}

@Injectable()
export class BookmakerCredentialsService {
  constructor(private readonly repository: BookmakerCredentialsRepository) {}

  private toSafeView(entity: {
    id: string;
    provider: BookmakerProvider;
    accountLabel?: string;
    loginUrl?: string;
    usernameEncrypted?: string;
    passwordEncrypted?: string;
    twoFactorSecretEncrypted?: string;
    updatedAt: Date;
    createdAt: Date;
  }): BookmakerCredentialsSafeView {
    return {
      id: entity.id,
      provider: entity.provider,
      accountLabel: entity.accountLabel,
      loginUrl: entity.loginUrl,
      hasUsername: Boolean(entity.usernameEncrypted),
      hasPassword: Boolean(entity.passwordEncrypted),
      hasTwoFactorSecret: Boolean(entity.twoFactorSecretEncrypted),
      updatedAt: entity.updatedAt,
      createdAt: entity.createdAt,
    };
  }

  getSupportedProviders(): BookmakerProvider[] {
    return ['betano', 'bet365', 'betfair', 'bwin', 'unibet', 'other'];
  }

  async listForUser(userId: string): Promise<BookmakerCredentialsSafeView[]> {
    const rows = await this.repository.findByUser(userId);
    return rows.map((row) => this.toSafeView(row));
  }

  async upsertForUser(userId: string, dto: UpsertBookmakerCredentialsDto): Promise<BookmakerCredentialsSafeView> {
    const current = await this.repository.findByUserAndProvider(userId, dto.provider);

    const usernameEncrypted = dto.username !== undefined
      ? encryptSecret(dto.username)
      : current?.usernameEncrypted;
    const passwordEncrypted = dto.password !== undefined
      ? encryptSecret(dto.password)
      : current?.passwordEncrypted;
    const twoFactorSecretEncrypted = dto.twoFactorSecret !== undefined
      ? encryptSecret(dto.twoFactorSecret)
      : current?.twoFactorSecretEncrypted;

    if (!usernameEncrypted || !passwordEncrypted) {
      throw new BadRequestException('username and password are required for first-time provider setup');
    }

    const saved = await this.repository.upsertByUserAndProvider(userId, dto.provider, {
      accountLabel: dto.accountLabel,
      loginUrl: dto.loginUrl,
      usernameEncrypted,
      passwordEncrypted,
      twoFactorSecretEncrypted,
    });

    return this.toSafeView(saved);
  }

  async removeForUser(userId: string, id: string): Promise<void> {
    const deleted = await this.repository.deleteForUser(id, userId);
    if (!deleted) throw new NotFoundException('Credentials not found');
  }

  async getDecryptedForAutomation(userId: string, provider: BookmakerProvider): Promise<{
    provider: BookmakerProvider;
    loginUrl?: string;
    username: string;
    password: string;
    twoFactorSecret?: string;
  }> {
    const row = await this.repository.findByUserAndProvider(userId, provider);
    if (!row) throw new NotFoundException('Credentials not found for provider');
    if (!row.usernameEncrypted || !row.passwordEncrypted) {
      throw new BadRequestException('Incomplete credentials for provider');
    }

    return {
      provider,
      loginUrl: row.loginUrl,
      username: decryptSecret(row.usernameEncrypted),
      password: decryptSecret(row.passwordEncrypted),
      twoFactorSecret: row.twoFactorSecretEncrypted
        ? decryptSecret(row.twoFactorSecretEncrypted)
        : undefined,
    };
  }
}
