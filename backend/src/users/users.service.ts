import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './infrastructure/repositories/users.repository';
import { UpdateUserDto } from './application/dtos/update-user.dto';
import { UserEntity } from './domain/entities/user.entity';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findById(id: string): Promise<UserEntity> {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findAll(): Promise<UserEntity[]> {
    return this.usersRepository.findAll();
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserEntity> {
    const user = await this.usersRepository.update(id, dto);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async delete(id: string): Promise<void> {
    return this.usersRepository.delete(id);
  }
}
