import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/env.js';
import { decryptBuffer, encryptBuffer } from '../utils/encryption.js';
import { sha256Hex } from '../utils/crypto.js';
import { StorageProvider, StorageUploadResult } from './provider.interface.js';

export class LocalDiskStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir = config.LOCAL_STORAGE_DIR) {
    this.baseDir = path.resolve(baseDir);
  }

  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch {
      // already exists
    }
  }

  async put(key: string, data: Buffer, _mimeType?: string): Promise<StorageUploadResult> {
    await this.ensureDir();

    // 1. Calculate unencrypted SHA-256 hash (this matches on-chain Soroban hash)
    const rawHash = sha256Hex(data);

    // 2. Encrypt at rest with AES-256-GCM
    const encrypted = encryptBuffer(data);

    // 3. Save to disk
    const filePath = path.join(this.baseDir, key.replace(/[/\\]/g, '_'));
    await fs.writeFile(filePath, encrypted.ciphertext);

    // 4. Save metadata alongside
    const metaPath = `${filePath}.meta.json`;
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        key,
        sizeBytes: data.length,
        sha256Hash: rawHash,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      })
    );

    return {
      key,
      sizeBytes: data.length,
      sha256Hash: rawHash,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    };
  }

  async get(key: string): Promise<Buffer> {
    const filePath = path.join(this.baseDir, key.replace(/[/\\]/g, '_'));
    const metaPath = `${filePath}.meta.json`;

    const [ciphertext, metaContent] = await Promise.all([
      fs.readFile(filePath),
      fs.readFile(metaPath, 'utf-8'),
    ]);

    const meta = JSON.parse(metaContent);
    return decryptBuffer(ciphertext, meta.iv, meta.authTag);
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.baseDir, key.replace(/[/\\]/g, '_'));
    const metaPath = `${filePath}.meta.json`;
    await Promise.allSettled([fs.unlink(filePath), fs.unlink(metaPath)]);
  }

  async getDownloadUrl(key: string, _expiresInSeconds = 3600): Promise<string> {
    return `/api/v1/storage/download/${encodeURIComponent(key)}`;
  }

  async getUploadUrl(key: string, _expiresInSeconds = 3600): Promise<string> {
    return `/api/v1/storage/upload?key=${encodeURIComponent(key)}`;
  }
}

export const storageService: StorageProvider = new LocalDiskStorageProvider();
