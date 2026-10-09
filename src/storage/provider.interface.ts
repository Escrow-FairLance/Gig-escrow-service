export interface StorageUploadResult {
  key: string;
  sizeBytes: number;
  sha256Hash: string;
  iv?: string;
  authTag?: string;
}

export interface StorageProvider {
  /**
   * Uploads raw buffer to storage backend.
   */
  put(key: string, data: Buffer, mimeType?: string): Promise<StorageUploadResult>;

  /**
   * Retrieves raw buffer from storage backend.
   */
  get(key: string): Promise<Buffer>;

  /**
   * Deletes object from storage backend.
   */
  delete(key: string): Promise<void>;

  /**
   * Generates a pre-signed download URL or direct access path.
   */
  getDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;

  /**
   * Generates a pre-signed upload URL or direct upload path.
   */
  getUploadUrl(key: string, expiresInSeconds?: number): Promise<string>;
}
