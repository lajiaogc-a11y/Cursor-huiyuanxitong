import { createHmac, randomUUID } from 'crypto';

const DEFAULT_TIMEOUT_MS = 15_000;

export type DeliverWebhookResult = {
  success: boolean;
  responseStatus: number | null;
  responseBody: string | null;
  responseTimeMs: number;
  errorMessage: string | null;
};

export type WebhookRow = {
  id: string;
  tenant_id: string;
  name: string;
  url: string;
  secret: string | null;
  events: unknown;
  is_active: number | null;
};

function generateSignature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

export async function deliverWebhookHttp(
  webhook: WebhookRow,
  eventType: string,
  payload: Record<string, unknown>,
  attemptCount: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<DeliverWebhookResult> {
  const startTime = Date.now();
  const payloadString = JSON.stringify(payload);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': eventType,
      'X-Webhook-Delivery-Id': randomUUID(),
      'X-Webhook-Attempt': String(attemptCount),
    };

    if (webhook.secret) {
      const signature = generateSignature(payloadString, webhook.secret);
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseBody = await response.text();
    const responseTimeMs = Date.now() - startTime;

    return {
      success: response.ok,
      responseStatus: response.status,
      responseBody: responseBody.substring(0, 1000),
      responseTimeMs,
      errorMessage: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error: unknown) {
    const responseTimeMs = Date.now() - startTime;
    const name = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      responseStatus: null,
      responseBody: null,
      responseTimeMs,
      errorMessage: name === 'AbortError' ? 'Request timeout' : message,
    };
  }
}
