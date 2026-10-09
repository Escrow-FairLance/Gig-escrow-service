import { scValToNative, xdr } from '@stellar/stellar-sdk';

export interface DecodedContractEvent {
  topic: string;
  jobId: bigint;
  data: Record<string, unknown>;
  rawTopics: string[];
}

export class ContractEventParser {
  /**
   * Parses raw Soroban RPC event into a typed domain event object.
   */
  public parseEvent(event: {
    topic: string[]; // Base64 XDR strings
    value: string; // Base64 XDR string
    ledger?: number;
    id?: string;
  }): DecodedContractEvent | null {
    try {
      if (!event.topic || event.topic.length === 0) {
        return null;
      }

      // First topic is the event name symbol
      const topic0Val = xdr.ScVal.fromXDR(event.topic[0], 'base64');
      const topicName = scValToNative(topic0Val) as string;

      // Second topic is usually job_id (u64 / i128)
      let jobId = 0n;
      if (event.topic.length > 1) {
        const jobIdVal = xdr.ScVal.fromXDR(event.topic[1], 'base64');
        const nativeJobId = scValToNative(jobIdVal);
        jobId = typeof nativeJobId === 'bigint' ? nativeJobId : BigInt(nativeJobId ?? 0);
      }

      // Parse payload
      const valueVal = xdr.ScVal.fromXDR(event.value, 'base64');
      const nativeValue = scValToNative(valueVal);

      const data: Record<string, unknown> = {};
      if (typeof nativeValue === 'object' && nativeValue !== null) {
        Object.assign(data, nativeValue);
      } else {
        data.payload = nativeValue;
      }

      return {
        topic: topicName,
        jobId,
        data,
        rawTopics: event.topic,
      };
    } catch (err) {
      console.warn('Failed to parse contract event:', err);
      return null;
    }
  }
}

export const contractEventParser = new ContractEventParser();
