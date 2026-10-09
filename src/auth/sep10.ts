import {
  Account,
  Keypair,
  Networks,
  Operation,
  TimeoutInfinite,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import crypto from 'crypto';
import { config } from '../config/env.js';

const CHALLENGE_EXPIRY_SECONDS = 300; // 5 minutes

export class Sep10Service {
  private serverKeypair: Keypair;
  private networkPassphrase: string;

  constructor() {
    this.serverKeypair = Keypair.fromSecret(config.SERVER_SIGNING_KEY);
    this.networkPassphrase = config.STELLAR_NETWORK_PASSPHRASE;
  }

  public getServerPublicKey(): string {
    return this.serverKeypair.publicKey();
  }

  /**
   * Generates a standard SEP-10 challenge transaction for a client account.
   */
  public buildChallengeTransaction(clientPublicKey: string, homeDomain = 'fairlance.io'): string {
    // Validate public keys
    Keypair.fromPublicKey(clientPublicKey);

    const now = Math.floor(Date.now() / 1000);
    const validUntil = now + CHALLENGE_EXPIRY_SECONDS;

    // Dummy account sequence for challenge
    const serverAccount = new Account(this.serverKeypair.publicKey(), '0');

    // Random 48-byte cryptographically secure nonce
    const nonce = crypto.randomBytes(48).toString('base64');

    const tx = new TransactionBuilder(serverAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
      timebounds: {
        minTime: now,
        maxTime: validUntil,
      },
    })
      .addOperation(
        Operation.manageData({
          source: clientPublicKey,
          name: `${homeDomain} auth`,
          value: Buffer.from(nonce, 'utf-8'),
        })
      )
      .setTimeout(TimeoutInfinite)
      .build();

    // Sign with server private key
    tx.sign(this.serverKeypair);

    return tx.toXDR();
  }

  /**
   * Validates a client-signed SEP-10 challenge transaction.
   * Returns the verified client public key.
   */
  public verifyChallengeTransaction(
    signedXdr: string,
    clientPublicKey: string,
    homeDomain = 'fairlance.io'
  ): { valid: boolean; clientAddress: string; error?: string } {
    try {
      const tx = new Transaction(signedXdr, this.networkPassphrase);

      // Verify timebounds
      const now = Math.floor(Date.now() / 1000);
      if (!tx.timeBounds) {
        return { valid: false, clientAddress: clientPublicKey, error: 'Missing timebounds in transaction' };
      }

      const minTime = parseInt(tx.timeBounds.minTime, 10);
      const maxTime = parseInt(tx.timeBounds.maxTime, 10);

      if (now < minTime || now > maxTime) {
        return { valid: false, clientAddress: clientPublicKey, error: 'Challenge transaction has expired' };
      }

      // Verify server signature is present and valid
      const serverHash = tx.hash();
      const serverSigned = this.serverKeypair.verify(serverHash, tx.signatures[0].signature());
      if (!serverSigned) {
        return { valid: false, clientAddress: clientPublicKey, error: 'Invalid server signature on challenge' };
      }

      // Verify operation matches expected structure
      const op = tx.operations[0];
      if (!op || op.type !== 'manageData' || op.source !== clientPublicKey) {
        return { valid: false, clientAddress: clientPublicKey, error: 'Invalid operation in challenge transaction' };
      }

      if (!op.name.startsWith(homeDomain)) {
        return { valid: false, clientAddress: clientPublicKey, error: 'Home domain mismatch in challenge' };
      }

      // Verify client signature
      const clientKeypair = Keypair.fromPublicKey(clientPublicKey);
      let clientSignatureFound = false;

      for (const sig of tx.signatures) {
        try {
          if (clientKeypair.verify(serverHash, sig.signature())) {
            clientSignatureFound = true;
            break;
          }
        } catch {
          // Signature was for different key, continue checking
        }
      }

      if (!clientSignatureFound) {
        return { valid: false, clientAddress: clientPublicKey, error: 'Missing or invalid client signature' };
      }

      return { valid: true, clientAddress: clientPublicKey };
    } catch (err) {
      return {
        valid: false,
        clientAddress: clientPublicKey,
        error: err instanceof Error ? err.message : 'Unknown SEP-10 verification error',
      };
    }
  }
}

export const sep10Service = new Sep10Service();
