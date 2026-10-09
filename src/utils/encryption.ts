import crypto from 'crypto';
import { config } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: string; // Hex string
  authTag: string; // Hex string
}

function getMasterKey(): Buffer {
  // Derive a 32-byte key from STORAGE_ENCRYPTION_KEY
  return crypto.createHash('sha256').update(config.STORAGE_ENCRYPTION_KEY).digest();
}

/**
 * Encrypts a buffer using AES-256-GCM authenticated encryption.
 */
export function encryptBuffer(data: Buffer, customKey?: Buffer): EncryptedPayload {
  const key = customKey ?? getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypts a buffer using AES-256-GCM authenticated encryption.
 * Throws an error if the authTag does not match (tampering detected).
 */
export function decryptBuffer(
  ciphertext: Buffer,
  ivHex: string,
  authTagHex: string,
  customKey?: Buffer
): Buffer {
  const key = customKey ?? getMasterKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Encrypts a plaintext string into a packaged base64 string.
 */
export function encryptString(plaintext: string): string {
  const payload = encryptBuffer(Buffer.from(plaintext, 'utf-8'));
  return JSON.stringify({
    ct: payload.ciphertext.toString('base64'),
    iv: payload.iv,
    tag: payload.authTag,
  });
}

/**
 * Decrypts a packaged base64 string into plaintext.
 */
export function decryptString(packaged: string): string {
  const parsed = JSON.parse(packaged) as { ct: string; iv: string; tag: string };
  const decrypted = decryptBuffer(
    Buffer.from(parsed.ct, 'base64'),
    parsed.iv,
    parsed.tag
  );
  return decrypted.toString('utf-8');
}
