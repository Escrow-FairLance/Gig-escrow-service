import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Keypair, Transaction } from '@stellar/stellar-sdk';
import {
  canonicalJsonStringify,
  hashMilestoneTitle,
  hashTerms,
  sha256Hex,
  verifyHash,
} from '../src/utils/crypto.js';
import {
  decryptBuffer,
  decryptString,
  encryptBuffer,
  encryptString,
} from '../src/utils/encryption.js';
import { sep10Service } from '../src/auth/sep10.js';

describe('Crypto & Hashing Utilities', () => {
  it('should deterministically order JSON keys for canonical terms hashing', () => {
    const objA = { z: 1, a: 'hello', nested: { b: 2, a: 1 } };
    const objB = { a: 'hello', nested: { a: 1, b: 2 }, z: 1 };

    const strA = canonicalJsonStringify(objA);
    const strB = canonicalJsonStringify(objB);

    assert.strictEqual(strA, strB);
    assert.strictEqual(hashTerms(objA), hashTerms(objB));
  });

  it('should compute valid 64-char hex SHA-256 hash', () => {
    const hash = sha256Hex('test payload');
    assert.strictEqual(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.strictEqual(verifyHash('test payload', hash), true);
    assert.strictEqual(verifyHash('wrong payload', hash), false);
  });

  it('should hash milestone titles consistently', () => {
    const h1 = hashMilestoneTitle('  Milestone 1: Design  ');
    const h2 = hashMilestoneTitle('Milestone 1: Design');
    assert.strictEqual(h1, h2);
  });
});

describe('AES-256-GCM Encryption', () => {
  it('should encrypt and decrypt buffers round-trip', () => {
    const plaintext = Buffer.from('Confidential deliverable contents: Source code & diagrams');
    const encrypted = encryptBuffer(plaintext);

    assert.notStrictEqual(encrypted.ciphertext.toString('hex'), plaintext.toString('hex'));
    assert.strictEqual(encrypted.iv.length, 24); // 12 bytes = 24 hex
    assert.strictEqual(encrypted.authTag.length, 32); // 16 bytes = 32 hex

    const decrypted = decryptBuffer(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
    assert.strictEqual(decrypted.toString('utf-8'), plaintext.toString('utf-8'));
  });

  it('should detect ciphertext tampering and throw tag error', () => {
    const plaintext = Buffer.from('Tamper test data');
    const encrypted = encryptBuffer(plaintext);

    // Flip a byte in ciphertext
    encrypted.ciphertext[0] ^= 0xff;

    assert.throws(() => {
      decryptBuffer(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
    });
  });

  it('should encrypt and decrypt packaged strings', () => {
    const str = 'Sensitive freelancer agreement notes';
    const encryptedStr = encryptString(str);
    const decryptedStr = decryptString(encryptedStr);
    assert.strictEqual(decryptedStr, str);
  });
});

describe('SEP-10 Stellar Web Authentication Flow', () => {
  it('should build challenge transaction, sign, and verify correctly', () => {
    const clientKeypair = Keypair.random();
    const challengeXdr = sep10Service.buildChallengeTransaction(clientKeypair.publicKey());

    assert.ok(challengeXdr);
    assert.strictEqual(typeof challengeXdr, 'string');

    // Client signs challenge transaction
    const tx = new Transaction(challengeXdr, 'Test SDF Network ; September 2015');
    tx.sign(clientKeypair);
    const signedXdr = tx.toXDR();

    // Server verifies
    const result = sep10Service.verifyChallengeTransaction(signedXdr, clientKeypair.publicKey());
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.clientAddress, clientKeypair.publicKey());
  });

  it('should reject challenge signed with wrong key', () => {
    const clientKeypair = Keypair.random();
    const attackerKeypair = Keypair.random();
    const challengeXdr = sep10Service.buildChallengeTransaction(clientKeypair.publicKey());

    const tx = new Transaction(challengeXdr, 'Test SDF Network ; September 2015');
    tx.sign(attackerKeypair);
    const signedXdr = tx.toXDR();

    const result = sep10Service.verifyChallengeTransaction(signedXdr, clientKeypair.publicKey());
    assert.strictEqual(result.valid, false);
  });
});
