export class UserEntity {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  roles: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial?: Partial<UserEntity>) {
    this.roles = ['user'];
    this.isActive = true;
    if (partial) Object.assign(this, partial);
  }
}
