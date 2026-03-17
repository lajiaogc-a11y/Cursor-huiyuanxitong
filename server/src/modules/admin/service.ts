/**
 * Admin Service - 数据管理/归档
 */
import {
  verifyAdminPasswordRepository,
  bulkDeleteRepository,
  deleteOrderByIdRepository,
  deleteMemberByIdRepository,
} from './repository.js';
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
  const { deletedSummary, errors } = await bulkDeleteRepository({
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
