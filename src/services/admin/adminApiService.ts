/**
 * Admin API Service - 数据管理/归档（经后端 API，替代旧版管理页直连）
 */
import { adminApi } from '@/api/admin';
import { unwrapApiData } from '@/api/client';

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
  const res = await adminApi.verifyPassword({ password });
  return (res as { success?: boolean; valid?: boolean })?.success === true && (res as { valid?: boolean })?.valid === true;
}

export async function bulkDeleteApi(params: {
  password: string;
  retainMonths: number;
  deleteSelections: BulkDeleteSelections;
}): Promise<BulkDeleteResult> {
  const res = await adminApi.bulkDelete(params);
  const data = unwrapApiData<BulkDeleteResult>(res);
  return normalizeBulkDeleteResult(data);
}

export async function archiveOrdersApi(params: {
  password: string;
  retainMonths: number;
  recycleActivityData?: boolean;
}): Promise<BulkDeleteResult> {
  const res = await adminApi.archiveOrders(params);
  const data = unwrapApiData<BulkDeleteResult>(res);
  return normalizeBulkDeleteResult(data);
}

export async function archiveMembersApi(params: {
  password: string;
  retainMonths: number;
  preserveActivityData?: boolean;
}): Promise<BulkDeleteResult> {
  const res = await adminApi.archiveMembers(params);
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

export async function deleteOrderApi(orderId: string): Promise<boolean> {
  await adminApi.deleteOrder(orderId);
  return true;
}

export async function deleteMemberApi(memberId: string): Promise<boolean> {
  await adminApi.deleteMember(memberId);
  return true;
}
