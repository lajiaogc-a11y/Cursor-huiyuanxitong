import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { queryOne } from '../../database/index.js';
import { insertWebhookQueueEvent, scheduleProcessWebhookQueueInBackground } from './processor.js';

const ALLOWED_EVENT_TYPES = new Set([
  'order.created',
  'order.completed',
  'order.cancelled',
  'member.created',
  'member.updated',
  'points.issued',
  'points.redeemed',
  'gift.created',
]);

export async function postEnqueueWebhookEventController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.user?.type === 'member') {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return;
  }

  const body = (req.body || {}) as { event_type?: string; payload?: unknown; tenant_id?: string };
  const eventType = typeof body.event_type === 'string' ? body.event_type.trim() : '';
  if (!eventType || !ALLOWED_EVENT_TYPES.has(eventType)) {
    res.status(400).json({ success: false, error: 'Invalid event_type' });
    return;
  }

  const payload = body.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    res.status(400).json({ success: false, error: 'Invalid payload' });
    return;
  }

  let tenantId = req.user?.tenant_id ?? undefined;
  if (!tenantId && req.user?.id) {
    const row = await queryOne<{ tenant_id: string | null }>(
      'SELECT tenant_id FROM `employees` WHERE `id` = ? LIMIT 1',
      [req.user.id],
    );
    tenantId = row?.tenant_id ?? undefined;
  }

  if (!tenantId && req.user?.is_platform_super_admin && typeof body.tenant_id === 'string' && body.tenant_id.trim()) {
    tenantId = body.tenant_id.trim();
  }

  if (!tenantId) {
    res.status(400).json({ success: false, error: 'tenant_id required' });
    return;
  }

  try {
    const id = await insertWebhookQueueEvent({
      tenantId,
      eventType,
      payload: payload as Record<string, unknown>,
    });
    scheduleProcessWebhookQueueInBackground();
    res.json({ success: true, event_id: id });
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
}
