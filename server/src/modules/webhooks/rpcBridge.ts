import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { queryOne } from '../../database/index.js';
import { runWebhookConnectivityTest } from './processor.js';

/**
 * /api/data/rpc/webhook-processor — 当前实现 test；trigger/process_queue 走 HTTP 专用路由
 */
export async function runWebhookProcessorRpc(
  req: AuthenticatedRequest,
  params: Record<string, unknown>,
): Promise<{ success: boolean; message?: string }> {
  const action = params.action;
  if (action !== 'test') {
    return { success: false, message: 'Unsupported action (use POST /api/webhooks/enqueue or internal process-queue)' };
  }

  const webhookId = String(params.webhookId ?? params.webhook_id ?? '').trim();
  if (!webhookId) {
    return { success: false, message: 'webhookId required' };
  }

  if (req.user?.type !== 'employee' || !req.user.id) {
    return { success: false, message: 'Forbidden' };
  }

  const webhook = await queryOne<{ tenant_id: string }>('SELECT tenant_id FROM `webhooks` WHERE `id` = ? LIMIT 1', [
    webhookId,
  ]);
  if (!webhook) {
    return { success: false, message: 'Webhook not found' };
  }

  let jwtTenant = req.user.tenant_id ?? null;
  if (!jwtTenant) {
    const row = await queryOne<{ tenant_id: string | null }>('SELECT tenant_id FROM `employees` WHERE `id` = ? LIMIT 1', [
      req.user.id,
    ]);
    jwtTenant = row?.tenant_id ?? null;
  }

  if (req.user.is_platform_super_admin === true) {
    return runWebhookConnectivityTest(webhookId);
  }
  if (webhook.tenant_id === jwtTenant) {
    return runWebhookConnectivityTest(webhookId);
  }
  const superish = req.user.is_super_admin === true || req.user.role === 'admin';
  if (superish && !jwtTenant) {
    return runWebhookConnectivityTest(webhookId);
  }
  return { success: false, message: 'Forbidden' };
}
