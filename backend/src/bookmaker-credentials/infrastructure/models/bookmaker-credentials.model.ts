import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BookmakerCredentialsDocument = BookmakerCredentials & Document;

@Schema({ timestamps: true, collection: 'bookmaker_credentials' })
export class BookmakerCredentials {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  provider: string;

  @Prop()
  accountLabel?: string;

  @Prop()
  loginUrl?: string;

  @Prop()
  usernameEncrypted?: string;

  @Prop()
  passwordEncrypted?: string;

  @Prop()
  twoFactorSecretEncrypted?: string;
}

export const BookmakerCredentialsSchema = SchemaFactory.createForClass(BookmakerCredentials);
BookmakerCredentialsSchema.index({ userId: 1, provider: 1 }, { unique: true });
