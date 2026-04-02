import { randomUUID } from 'crypto';
import { execute, query, queryOne } from '../../database/index.js';
import { deliverWebhookHttp, type WebhookRow } from './delivery.js';

const MAX_BATCH = 50;
const MAX_RETRIES = 5;

function normalizeEvents(events: unknown): string[] {
  if (Array.isArray(events)) return events.map((e) => String(e));
  if (typeof events === 'string') {
    try {
      const j = JSON.parse(events) as unknown;
      return Array.isArray(j) ? j.map((e) => String(e)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function subscribesToEvent(events: unknown, eventType: string): boolean {
  return normalizeEvents(events).includes(eventType);
}

type QueueRow = {
  id: string;
  tenant_id: string;
  event_type: string;
  payload: Record<string, unknown> | string;
  status: string;
  retry_count: number;
  next_retry_at: Date | string | null;
};

function parsePayload(payload: QueueRow['payload']): Record<string, unknown> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  if (typeof payload === 'string') {
    try {
      const p = JSON.parse(payload) as unknown;
      return typeof p === 'object' && p !== null && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

export async function insertWebhookQueueEvent(input: {
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<string> {
  const id = randomUUID();
  await execute(
    `INSERT INTO \`webhook_event_queue\` (\`id\`, \`tenant_id\`, \`event_type\`, \`payload\`, \`status\`)
     VALUES (?, ?, ?, CAST(? AS JSON), 'pending')`,
    [id, input.tenantId, input.eventType, JSON.stringify(input.payload)],
  );
  return id;
}

export async function processWebhookQueueBatch(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  const events = await query<QueueRow>(
    `SELECT * FROM \`webhook_event_queue\`
     WHERE \`status\` = 'pending'
        OR (\`status\` = 'failed' AND \`next_retry_at\` IS NOT NULL AND \`next_retry_at\` <= NOW(3))
     ORDER BY \`created_at\` ASC
     LIMIT ?`,
    [MAX_BATCH],
  );

  if (!events.length) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  for (const event of events) {
    const payloadObj = parsePayload(event.payload);

    const hooks = await query<WebhookRow>(
      `SELECT * FROM \`webhooks\` WHERE \`tenant_id\` = ? AND \`is_active\` = 1`,
      [event.tenant_id],
    );

    const targets = hooks.filter((w) => subscribesToEvent(w.events, event.event_type));

    if (targets.length === 0) {
      await execute(
        `UPDATE \`webhook_event_queue\` SET \`status\` = 'processed', \`processed_at\` = NOW(3) WHERE \`id\` = ?`,
        [event.id],
      );
      processed++;
      succeeded++;
      continue;
    }

    let allOk = true;
    const attemptCount = event.retry_count + 1;

    for (const webhook of targets) {
      const result = await deliverWebhookHttp(webhook, event.event_type, payloadObj, attemptCount);

      await execute(
        `INSERT INTO \`webhook_delivery_logs\` (\`id\`, \`webhook_id\`, \`event_type\`, \`payload\`, \`response_status\`, \`response_body\`, \`response_time_ms\`, \`attempt\`, \`success\`, \`error_message\`)
         VALUES (?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          webhook.id,
          event.event_type,
          JSON.stringify(payloadObj),
          result.responseStatus,
          result.responseBody,
          result.responseTimeMs,
          attemptCount,
          result.success ? 1 : 0,
          result.errorMessage,
        ],
      );

      if (!result.success) allOk = false;
    }

    processed++;

    if (allOk) {
      await execute(
        `UPDATE \`webhook_event_queue\` SET \`status\` = 'processed', \`processed_at\` = NOW(3) WHERE \`id\` = ?`,
        [event.id],
      );
      succeeded++;
    } else {
      const newRetry = event.retry_count + 1;
      if (newRetry >= MAX_RETRIES) {
        await execute(
          `UPDATE \`webhook_event_queue\` SET \`status\` = 'failed', \`processed_at\` = NOW(3), \`retry_count\` = ? WHERE \`id\` = ?`,
          [newRetry, event.id],
        );
        failed++;
      } else {
        const delayMinutes = Math.pow(2, newRetry - 1);
        await execute(
          `UPDATE \`webhook_event_queue\`
           SET \`status\` = 'failed', \`retry_count\` = ?, \`next_retry_at\` = DATE_ADD(NOW(3), INTERVAL ? MINUTE)
           WHERE \`id\` = ?`,
          [newRetry, delayMinutes, event.id],
        );
      }
    }
  }

  return { processed, succeeded, failed };
}

export async function runWebhookConnectivityTest(webhookId: string): Promise<{
  success: boolean;
  message: string;
}> {
  const webhook = await queryOne<WebhookRow>('SELECT * FROM `webhooks` WHERE `id` = ? LIMIT 1', [webhookId]);
  if (!webhook) {
    return { success: false, message: 'Webhook not found' };
  }

  const testPayload = {
    event: 'test',
    timestamp: new Date().toISOString(),
    message: 'This is a test webhook delivery',
  };

  const result = await deliverWebhookHttp(webhook, 'test', testPayload, 1);

  await execute(
    `INSERT INTO \`webhook_delivery_logs\` (\`id\`, \`webhook_id\`, \`event_type\`, \`payload\`, \`response_status\`, \`response_body\`, \`response_time_ms\`, \`attempt\`, \`success\`, \`error_message\`)
     VALUES (?, ?, 'test', CAST(? AS JSON), ?, ?, ?, 1, ?, ?)`,
    [
      randomUUID(),
      webhookId,
      JSON.stringify(testPayload),
      result.responseStatus,
      result.responseBody,
      result.responseTimeMs,
      result.success ? 1 : 0,
      result.errorMessage,
    ],
  );

  return {
    success: result.success,
    message: result.success
      ? `Test successful! Response: ${result.responseStatus} in ${result.responseTimeMs}ms`
      : `Test failed: ${result.errorMessage}`,
  };
}

/** 可挂载到进程内定时任务（可选） */
export function scheduleProcessWebhookQueueInBackground(): void {
  setImmediate(() => {
    processWebhookQueueBatch().catch((e) => console.error('[Webhook] background queue error:', (e as Error).message));
  });
}
