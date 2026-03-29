export type BookmakerProvider =
  | 'betano'
  | 'bet365'
  | 'betfair'
  | 'bwin'
  | 'unibet'
  | 'other';

export class BookmakerCredentialsEntity {
  id: string;
  userId: string;
  provider: BookmakerProvider;
  accountLabel?: string;
  loginUrl?: string;
  usernameEncrypted?: string;
  passwordEncrypted?: string;
  twoFactorSecretEncrypted?: string;
  createdAt: Date;
  updatedAt: Date;
}
