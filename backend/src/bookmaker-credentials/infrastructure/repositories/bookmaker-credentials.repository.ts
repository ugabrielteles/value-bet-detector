import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BookmakerCredentials,
  BookmakerCredentialsDocument,
} from '../models/bookmaker-credentials.model';
import { BookmakerCredentialsEntity } from '../../domain/entities/bookmaker-credentials.entity';

@Injectable()
export class BookmakerCredentialsRepository {
  constructor(
    @InjectModel(BookmakerCredentials.name)
    private readonly model: Model<BookmakerCredentialsDocument>,
  ) {}

  private toEntity(doc: BookmakerCredentialsDocument): BookmakerCredentialsEntity {
    const entity = new BookmakerCredentialsEntity();
    entity.id = doc._id.toString();
    entity.userId = doc.userId;
    entity.provider = doc.provider as BookmakerCredentialsEntity['provider'];
    entity.accountLabel = doc.accountLabel;
    entity.loginUrl = doc.loginUrl;
    entity.usernameEncrypted = doc.usernameEncrypted;
    entity.passwordEncrypted = doc.passwordEncrypted;
    entity.twoFactorSecretEncrypted = doc.twoFactorSecretEncrypted;
    entity.createdAt = (doc as unknown as { createdAt: Date }).createdAt;
    entity.updatedAt = (doc as unknown as { updatedAt: Date }).updatedAt;
    return entity;
  }

  async findByUser(userId: string): Promise<BookmakerCredentialsEntity[]> {
    const docs = await this.model.find({ userId }).sort({ updatedAt: -1 }).exec();
    return docs.map((doc) => this.toEntity(doc));
  }

  async findByUserAndProvider(userId: string, provider: string): Promise<BookmakerCredentialsEntity | null> {
    const doc = await this.model.findOne({ userId, provider }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async upsertByUserAndProvider(
    userId: string,
    provider: string,
    payload: Partial<BookmakerCredentialsEntity>,
  ): Promise<BookmakerCredentialsEntity> {
    const doc = await this.model
      .findOneAndUpdate(
        { userId, provider },
        {
          $set: {
            accountLabel: payload.accountLabel,
            loginUrl: payload.loginUrl,
            ...(payload.usernameEncrypted !== undefined ? { usernameEncrypted: payload.usernameEncrypted } : {}),
            ...(payload.passwordEncrypted !== undefined ? { passwordEncrypted: payload.passwordEncrypted } : {}),
            ...(payload.twoFactorSecretEncrypted !== undefined
              ? { twoFactorSecretEncrypted: payload.twoFactorSecretEncrypted }
              : {}),
          },
          $setOnInsert: { userId, provider },
        },
        { new: true, upsert: true },
      )
      .exec();

    return this.toEntity(doc);
  }

  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const res = await this.model.deleteOne({ _id: id, userId }).exec();
    return res.deletedCount > 0;
  }
}
