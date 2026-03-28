import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { UserEntity } from '../../domain/entities/user.entity';
import { User, UserDocument } from '../models/user.model';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  private toEntity(doc: UserDocument): UserEntity {
    return new UserEntity({
      id: doc._id.toString(),
      email: doc.email,
      username: doc.username,
      passwordHash: doc.passwordHash,
      roles: doc.roles,
      isActive: doc.isActive,
      createdAt: (doc as unknown as { createdAt: Date }).createdAt,
      updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt,
    });
  }

  async findById(id: string): Promise<UserEntity | null> {
    const doc = await this.userModel.findById(id).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const doc = await this.userModel.findOne({ email: email.toLowerCase() }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    const doc = await this.userModel.findOne({ username }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findAll(): Promise<UserEntity[]> {
    const docs = await this.userModel.find().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async create(user: Partial<UserEntity>): Promise<UserEntity> {
    const doc = await this.userModel.create(user);
    return this.toEntity(doc);
  }

  async update(id: string, data: Partial<UserEntity>): Promise<UserEntity | null> {
    const doc = await this.userModel.findByIdAndUpdate(id, data, { new: true }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<void> {
    await this.userModel.findByIdAndDelete(id).exec();
  }
}
