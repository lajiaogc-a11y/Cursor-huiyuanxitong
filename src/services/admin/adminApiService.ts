/**
 * Admin API Service - 数据管理/归档
 * 替代 DataManagementTab 中的 Supabase 直连
 */
import { apiPost, apiDelete, unwrapApiData } from '@/api/client';

export interface BulkDeleteSelections {
  orders: boolean;
  recycleActivityDataOnOrderDelete?: boolean;
  reports?: { employee: boolean; card: boolean; vendor: boolean; daily: boolean };
  members?: {
    memberManagement: boolean;
    activityLotteryLogs?: boolean;
    activityCheckIns?: boolean;
    activitySpinOrder?: boolean;
    activitySpinShare?: boolean;
    activitySpinInvite?: boolean;
    activitySpinOther?: boolean;
    activityMemberSummary?: boolean;
    /** @deprecated 服务端仍识别为等同全选活动明细 */
    activityData?: boolean;
    activityGift: boolean;
    pointsLedger: boolean;
  };
  shiftData?: { shiftHandovers: boolean; shiftReceivers: boolean };
  merchantSettlement?: { balanceChangeLogs: boolean; initialBalances: boolean };
  referralRelations?: boolean;
  auditRecords?: boolean;
  operationLogs?: boolean;
  loginLogs?: boolean;
  knowledgeData?: { categories: boolean; articles: boolean };
  preserveActivityData?: boolean;
}

export interface BulkDeleteResult {
  success: boolean;
  deletedSummary: { table: string; count: number }[];
  totalCount: number;
  errors: string[];
  warnings?: string[];
}

/** 验证管理员密码 */
export async function verifyAdminPasswordApi(password: string): Promise<boolean> {
  const res = await apiPost<{ success?: boolean; valid?: boolean }>('/api/admin/verify-password', { password });
  return (res as { success?: boolean; valid?: boolean })?.success === true && (res as { valid?: boolean })?.valid === true;
}

/** 批量删除（DataManagementTab 主流程） */
export async function bulkDeleteApi(params: {
  password: string;
  retainMonths: number;
  deleteSelections: BulkDeleteSelections;
}): Promise<BulkDeleteResult> {
  const res = await apiPost<BulkDeleteResult | { success?: boolean; data?: BulkDeleteResult }>('/api/admin/bulk-delete', params);
  const data = unwrapApiData<BulkDeleteResult>(res);
  return normalizeBulkDeleteResult(data);
}

/** 归档订单（简化版） */
export async function archiveOrdersApi(params: {
  password: string;
  retainMonths: number;
  recycleActivityData?: boolean;
}): Promise<BulkDeleteResult> {
  const res = await apiPost<BulkDeleteResult | { success?: boolean; data?: BulkDeleteResult }>('/api/admin/archive-orders', params);
  const data = unwrapApiData<BulkDeleteResult>(res);
  return normalizeBulkDeleteResult(data);
}

/** 归档会员（简化版） */
export async function archiveMembersApi(params: {
  password: string;
  retainMonths: number;
  preserveActivityData?: boolean;
}): Promise<BulkDeleteResult> {
  const res = await apiPost<BulkDeleteResult | { success?: boolean; data?: BulkDeleteResult }>('/api/admin/archive-members', params);
  const data = unwrapApiData<BulkDeleteResult>(res);
  return normalizeBulkDeleteResult(data);
}

function normalizeBulkDeleteResult(data: unknown): BulkDeleteResult {
  if (!data || typeof data !== 'object') {
    return { success: false, deletedSummary: [], totalCount: 0, errors: ['响应数据异常'] };
  }
  const d = data as Record<string, unknown>;
  return {
    success: !!d.success,
    deletedSummary: Array.isArray(d.deletedSummary) ? d.deletedSummary : [],
    totalCount: typeof d.totalCount === 'number' ? d.totalCount : 0,
    errors: Array.isArray(d.errors) ? d.errors : [],
    warnings: Array.isArray(d.warnings) ? d.warnings : [],
  };
}

/** 删除单个订单 */
export async function deleteOrderApi(orderId: string): Promise<boolean> {
  await apiDelete(`/api/admin/orders/${encodeURIComponent(orderId)}`);
  return true;
}

/** 删除单个会员 */
export async function deleteMemberApi(memberId: string): Promise<boolean> {
  await apiDelete(`/api/admin/members/${encodeURIComponent(memberId)}`);
  return true;
}
