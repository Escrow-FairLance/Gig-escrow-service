import { prisma } from '../db/client.js';

export interface CursorState {
  contractId: string;
  pagingToken: string | null;
  lastLedger: number;
}

export class IndexerCursorRepository {
  async getCursor(contractId: string): Promise<CursorState> {
    const cursor = await prisma.indexerCursor.findUnique({
      where: { contractId },
    });

    if (!cursor) {
      const created = await prisma.indexerCursor.create({
        data: {
          contractId,
          lastLedger: 0,
        },
      });
      return {
        contractId: created.contractId,
        pagingToken: created.pagingToken,
        lastLedger: created.lastLedger,
      };
    }

    return {
      contractId: cursor.contractId,
      pagingToken: cursor.pagingToken,
      lastLedger: cursor.lastLedger,
    };
  }

  async updateCursor(contractId: string, pagingToken: string, lastLedger: number): Promise<void> {
    await prisma.indexerCursor.upsert({
      where: { contractId },
      update: {
        pagingToken,
        lastLedger,
      },
      create: {
        contractId,
        pagingToken,
        lastLedger,
      },
    });
  }

  async resetCursor(contractId: string, startLedger = 0): Promise<void> {
    await prisma.indexerCursor.upsert({
      where: { contractId },
      update: {
        pagingToken: null,
        lastLedger: startLedger,
      },
      create: {
        contractId,
        pagingToken: null,
        lastLedger: startLedger,
      },
    });
  }
}

export const indexerCursorRepo = new IndexerCursorRepository();
