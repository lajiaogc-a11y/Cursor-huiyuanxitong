import type { Request, Response } from 'express';
import { config } from '../../config/index.js';
import { getInternalJobSecret, timingSafeStringEqual } from '../../lib/internalCronAuth.js';
import { processWebhookQueueBatch } from './processor.js';

/**
 * POST /api/internal/webhooks/process-queue
 * 头：X-Webhook-Processor-Secret 或 Authorization: Bearer
 */
export async function postInternalWebhookProcessQueueController(req: Request, res: Response): Promise<void> {
  const expected = config.webhook.processorSecret;
  if (!expected) {
    res.status(503).json({ success: false, error: 'WEBHOOK_PROCESSOR_SECRET not configured' });
    return;
  }
  const provided = getInternalJobSecret(req, 'x-webhook-processor-secret');
  if (!provided || !timingSafeStringEqual(provided, expected)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  try {
    const result = await processWebhookQueueBatch();
    res.json({ success: true, ...result });
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
}
