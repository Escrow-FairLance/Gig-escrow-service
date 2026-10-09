import { prisma } from '../db/client.js';
import { AnchorTxKind, AnchorTxStatus } from '../types/domain.js';
import { anchorRegistry } from './registry.js';

export interface InteractiveSessionResult {
  id: string;
  url: string;
  kind: AnchorTxKind;
  status: AnchorTxStatus;
  anchorDomain: string;
  assetCode: string;
}

export class Sep24Service {
  /**
   * Initiates an interactive deposit session.
   */
  async initiateDeposit(input: {
    userAddress: string;
    anchorDomain: string;
    assetCode: string;
    amount?: string;
  }): Promise<InteractiveSessionResult> {
    const anchor = anchorRegistry.findByDomain(input.anchorDomain);
    if (!anchor) {
      throw new Error(`Unsupported anchor domain: ${input.anchorDomain}`);
    }

    const txId = `dep-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    // Build interactive URL with session token
    const interactiveUrl = anchor.sep24Url
      ? `${anchor.sep24Url}/transactions/deposit/webapp?transaction_id=${txId}&account=${input.userAddress}&asset_code=${input.assetCode}`
      : `https://${input.anchorDomain}/sep24/deposit?transaction_id=${txId}&account=${input.userAddress}`;

    const record = await prisma.anchorTransaction.create({
      data: {
        id: txId,
        userAddress: input.userAddress,
        anchorDomain: input.anchorDomain,
        assetCode: input.assetCode,
        kind: AnchorTxKind.DEPOSIT,
        status: AnchorTxStatus.INCOMPLETE,
        interactiveUrl,
        amountIn: input.amount ? parseFloat(input.amount) : null,
      },
    });

    return {
      id: record.id,
      url: interactiveUrl,
      kind: record.kind,
      status: record.status,
      anchorDomain: record.anchorDomain,
      assetCode: record.assetCode,
    };
  }

  /**
   * Initiates an interactive withdrawal session (e.g. USDC to NGN bank or M-Pesa).
   */
  async initiateWithdraw(input: {
    userAddress: string;
    anchorDomain: string;
    assetCode: string;
    amount?: string;
    dest?: string;
  }): Promise<InteractiveSessionResult> {
    const anchor = anchorRegistry.findByDomain(input.anchorDomain);
    if (!anchor) {
      throw new Error(`Unsupported anchor domain: ${input.anchorDomain}`);
    }

    const txId = `wth-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const interactiveUrl = anchor.sep24Url
      ? `${anchor.sep24Url}/transactions/withdraw/webapp?transaction_id=${txId}&account=${input.userAddress}&asset_code=${input.assetCode}`
      : `https://${input.anchorDomain}/sep24/withdraw?transaction_id=${txId}&account=${input.userAddress}`;

    const record = await prisma.anchorTransaction.create({
      data: {
        id: txId,
        userAddress: input.userAddress,
        anchorDomain: input.anchorDomain,
        assetCode: input.assetCode,
        kind: AnchorTxKind.WITHDRAW,
        status: AnchorTxStatus.INCOMPLETE,
        interactiveUrl,
        amountOut: input.amount ? parseFloat(input.amount) : null,
      },
    });

    return {
      id: record.id,
      url: interactiveUrl,
      kind: record.kind,
      status: record.status,
      anchorDomain: record.anchorDomain,
      assetCode: record.assetCode,
    };
  }

  /**
   * Retrieves or updates status of anchor transaction.
   */
  async getTransaction(id: string) {
    return prisma.anchorTransaction.findUnique({
      where: { id },
    });
  }

  /**
   * Simulates status progression for development/demo testing.
   */
  async updateStatus(id: string, status: AnchorTxStatus, stellarTxId?: string) {
    return prisma.anchorTransaction.update({
      where: { id },
      data: {
        status,
        stellarTransactionId: stellarTxId,
      },
    });
  }
}

export const sep24Service = new Sep24Service();
