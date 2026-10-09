import { config } from '../config/env.js';
import { stellarClient } from '../stellar/client.js';
import { contractEventParser } from '../stellar/events.js';
import { contractEventHandler } from './event-handler.js';
import { indexerCursorRepo } from './cursor.js';

export class IndexerService {
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private contractId: string;

  constructor() {
    this.contractId = config.ESCROW_CONTRACT_ID;
  }

  /**
   * Starts periodic polling of Soroban RPC events.
   */
  start(intervalMs = 6000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.info(`[Indexer] Starting Soroban RPC indexer for contract ${this.contractId}`);

    const runLoop = async () => {
      if (!this.isRunning) return;
      try {
        await this.pollOnce();
      } catch (err) {
        console.warn('[Indexer] Error during event poll cycle:', err);
      } finally {
        if (this.isRunning) {
          this.pollTimer = setTimeout(runLoop, intervalMs);
        }
      }
    };

    this.pollTimer = setTimeout(runLoop, 1000);
  }

  /**
   * Stops the indexer loop.
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.info('[Indexer] Stopped Soroban RPC indexer');
  }

  /**
   * Executes a single poll cycle against Soroban RPC getEvents.
   */
  async pollOnce(): Promise<{ eventsProcessed: number; lastLedger: number }> {
    const cursor = await indexerCursorRepo.getCursor(this.contractId);
    const latestLedger = await stellarClient.getLatestLedger();

    // Start ledger: use lastLedger or lookback 10 ledgers
    const startLedger = cursor.lastLedger > 0 ? cursor.lastLedger : Math.max(1, latestLedger - 100);

    if (startLedger > latestLedger) {
      return { eventsProcessed: 0, lastLedger: latestLedger };
    }

    try {
      const response = await stellarClient.rpcServer.getEvents({
        startLedger,
        filters: [
          {
            type: 'contract',
            contractIds: [this.contractId],
          },
        ],
        cursor: cursor.pagingToken ?? undefined,
        limit: 100,
      });

      let processedCount = 0;
      let highestLedger = startLedger;

      if (response && response.events) {
        for (const rawEvent of response.events) {
          const ledgerSeq = rawEvent.ledger;
          const txHash = rawEvent.txHash || `tx-${ledgerSeq}-${rawEvent.id}`;
          if (ledgerSeq > highestLedger) {
            highestLedger = ledgerSeq;
          }

          const parsed = contractEventParser.parseEvent({
            topic: rawEvent.topic.map((t) => (typeof t === 'string' ? t : t.toXDR('base64'))),
            value: typeof rawEvent.value === 'string' ? rawEvent.value : rawEvent.value.toXDR('base64'),
            ledger: ledgerSeq,
            id: rawEvent.id,
          });

          if (parsed) {
            const handled = await contractEventHandler.handleEvent(
              parsed,
              txHash,
              ledgerSeq,
              this.contractId
            );
            if (handled) processedCount++;
          }
        }

        const nextCursor = response.cursor || cursor.pagingToken || '';
        await indexerCursorRepo.updateCursor(this.contractId, nextCursor, highestLedger);
      }

      return { eventsProcessed: processedCount, lastLedger: highestLedger };
    } catch (err) {
      // In sandbox/mock offline mode, log gracefully
      console.warn(`[Indexer] Soroban getEvents query failed (rpc may be offline):`, err instanceof Error ? err.message : err);
      return { eventsProcessed: 0, lastLedger: startLedger };
    }
  }
}

export const indexerService = new IndexerService();
