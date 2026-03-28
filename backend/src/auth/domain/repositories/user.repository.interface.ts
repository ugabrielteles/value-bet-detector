import { UserEntity } from '../entities/user.entity';

export const USER_REPOSITORY = 'USER_REPOSITORY';

export interface IUserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findByUsername(username: string): Promise<UserEntity | null>;
  findAll(): Promise<UserEntity[]>;
  create(user: Partial<UserEntity>): Promise<UserEntity>;
  update(id: string, data: Partial<UserEntity>): Promise<UserEntity | null>;
  delete(id: string): Promise<void>;
}
