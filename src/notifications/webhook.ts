import crypto from 'crypto';
import { config } from '../config/env.js';

export interface WebhookPayload {
  event: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export class WebhookDispatcher {
  /**
   * Signs payload using HMAC-SHA256 with secret key.
   */
  signPayload(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Dispatches webhook event via HTTP POST to registered subscriber URL.
   */
  async dispatch(webhookUrl: string, event: string, data: Record<string, unknown>, secret = config.JWT_SECRET): Promise<boolean> {
    const timestamp = Date.now();
    const payloadObject: WebhookPayload = {
      event,
      timestamp,
      data,
    };

    const payloadString = JSON.stringify(payloadObject);
    const signature = this.signPayload(`${timestamp}.${payloadString}`, secret);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.WEBHOOK_TIMEOUT_MS);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-FairLance-Event': event,
          'X-FairLance-Timestamp': timestamp.toString(),
          'X-FairLance-Signature': signature,
        },
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return response.ok;
    } catch (err) {
      console.warn(`[Webhook] Dispatch failed for ${webhookUrl}:`, err instanceof Error ? err.message : err);
      return false;
    }
  }
}

export const webhookDispatcher = new WebhookDispatcher();
