/**
 * Admin Service - 数据管理/归档
 */
import {
  verifyAdminPasswordRepository,
  bulkDeleteRepository,
  deleteOrderByIdRepository,
  deleteMemberByIdRepository,
} from './repository.js';
import { execute } from '../../database/index.js';
import type { BulkDeleteRequest, BulkDeleteResult } from './types.js';

export async function verifyAdminPasswordService(
  username: string,
  password: string
): Promise<boolean> {
  return verifyAdminPasswordRepository(username, password);
}

export async function bulkDeleteService(
  params: BulkDeleteRequest,
  tenantId?: string | null
): Promise<BulkDeleteResult> {
  const { deletedSummary, errors, warnings } = await bulkDeleteRepository({
    retainMonths: params.retainMonths,
    deleteSelections: params.deleteSelections,
    tenantId,
  });
  const totalCount = deletedSummary.reduce((acc, s) => acc + s.count, 0);
  return {
    success: errors.length === 0,
    deletedSummary,
    totalCount,
    errors,
    warnings,
  };
}

export async function deleteOrderService(
  orderId: string,
  tenantId?: string | null
): Promise<{ success: boolean; error?: string }> {
  return deleteOrderByIdRepository(orderId, tenantId);
}

export async function deleteMemberService(
  memberId: string,
  tenantId?: string | null
): Promise<{ success: boolean; error?: string }> {
  return deleteMemberByIdRepository(memberId, tenantId);
}

/** 已处理 / 终态失败 的队列行，按天保留 */
export async function cleanupWebhookEventQueueService(input?: {
  processedRetentionDays?: number;
  failedRetentionDays?: number;
}): Promise<number> {
  const pDays = Math.min(3650, Math.max(1, input?.processedRetentionDays ?? 30));
  const fDays = Math.min(3650, Math.max(1, input?.failedRetentionDays ?? 90));

  const r1 = await execute(
    `DELETE FROM \`webhook_event_queue\`
     WHERE \`status\` = 'processed' AND \`processed_at\` IS NOT NULL
       AND \`processed_at\` < DATE_SUB(NOW(3), INTERVAL ? DAY)`,
    [pDays],
  );
  const r2 = await execute(
    `DELETE FROM \`webhook_event_queue\`
     WHERE \`status\` = 'failed' AND \`processed_at\` IS NOT NULL
       AND \`processed_at\` < DATE_SUB(NOW(3), INTERVAL ? DAY)`,
    [fDays],
  );
  return (r1.affectedRows ?? 0) + (r2.affectedRows ?? 0);
}
