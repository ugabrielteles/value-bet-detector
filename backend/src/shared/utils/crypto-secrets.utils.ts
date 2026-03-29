import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function derive32ByteKey(source: string): Buffer {
  const trimmed = source.trim();

  if (trimmed.startsWith('base64:')) {
    const raw = Buffer.from(trimmed.slice('base64:'.length), 'base64');
    if (raw.length !== 32) throw new Error('BOOKMAKER_CREDENTIALS_KEY base64 must decode to 32 bytes');
    return raw;
  }

  try {
    const asBase64 = Buffer.from(trimmed, 'base64');
    if (asBase64.length === 32) return asBase64;
  } catch {
    // Ignore and fallback to hash derivation.
  }

  return createHash('sha256').update(trimmed).digest();
}

function getMasterKey(): Buffer {
  const raw = process.env.BOOKMAKER_CREDENTIALS_KEY;
  if (!raw) {
    throw new Error('BOOKMAKER_CREDENTIALS_KEY is not configured');
  }
  return derive32ByteKey(raw);
}

export function encryptSecret(plainText: string): string {
  const key = getMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptSecret(payload: string): string {
  const key = getMasterKey();
  const [ivBase64, tagBase64, dataBase64] = String(payload ?? '').split('.');

  if (!ivBase64 || !tagBase64 || !dataBase64) {
    throw new Error('Invalid encrypted payload format');
  }

  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(tagBase64, 'base64');
  const encrypted = Buffer.from(dataBase64, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
