import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Encrypts cleartext using AES-256-GCM.
 * Output format: iv_hex:tag_hex:encrypted_hex
 */
export function encrypt(text: string, secretKey: string): string {
  // Ensure key length is exactly 32 bytes (256 bits)
  const key = crypto.createHash('sha256').update(secretKey).digest();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * Decrypts hex format cipher text encrypted by the encrypt function.
 */
export function decrypt(encryptedText: string, secretKey: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Geçersiz şifreli metin formatı');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const encrypted = Buffer.from(parts[2], 'hex');
  
  const key = crypto.createHash('sha256').update(secretKey).digest();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(encrypted as any, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
