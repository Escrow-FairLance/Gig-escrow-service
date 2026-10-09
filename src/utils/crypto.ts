import crypto from 'crypto';

/**
 * Deterministically sorts all object keys recursively for canonical serialization.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalJsonStringify(item)).join(',') + ']';
  }

  const record = obj as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const entries = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${canonicalJsonStringify(record[key])}`
  );
  return '{' + entries.join(',') + '}';
}

/**
 * Computes SHA-256 hash of a string, Buffer, or Uint8Array.
 * Returns 64-char lowercase hex string.
 */
export function sha256Hex(data: string | Buffer | Uint8Array): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Computes SHA-256 hash of a string, Buffer, or Uint8Array.
 * Returns 32-byte Buffer.
 */
export function sha256Buffer(data: string | Buffer | Uint8Array): Buffer {
  return crypto.createHash('sha256').update(data).digest();
}

/**
 * Computes canonical terms hash matching Soroban contract `terms_hash` requirement.
 */
export function hashTerms(terms: Record<string, unknown>): string {
  const canonicalJson = canonicalJsonStringify(terms);
  return sha256Hex(Buffer.from(canonicalJson, 'utf-8'));
}

/**
 * Computes milestone title/metadata hash.
 */
export function hashMilestoneTitle(title: string): string {
  return sha256Hex(Buffer.from(title.trim(), 'utf-8'));
}

/**
 * Computes deliverable payload SHA-256 hash.
 */
export function hashDeliverableContent(fileBuffer: Buffer): string {
  return sha256Hex(fileBuffer);
}

/**
 * Verifies if a provided hash matches the content hash in constant time.
 */
export function verifyHash(content: Buffer | string, expectedHex: string): boolean {
  const actualBuffer = typeof content === 'string'
    ? sha256Buffer(Buffer.from(content, 'utf-8'))
    : sha256Buffer(content);

  const expectedBuffer = Buffer.from(expectedHex, 'hex');
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
