/**
 * 员工端「会员门户设置」内嵌诊断：抽奖记录、会员操作日志等 RPC
 */
import { apiPost } from "@/api/client";

export type AdminListSpinsParams = {
  p_search?: string;
  p_source?: string;
  p_status?: string;
  p_date_from?: string;
  p_limit: number;
  p_offset: number;
};

export type AdminListSpinsResult = {
  success?: boolean;
  spins?: unknown[];
  total?: number;
};

export async function adminListSpins(params: AdminListSpinsParams): Promise<AdminListSpinsResult> {
  return apiPost<AdminListSpinsResult>("/api/data/rpc/admin_list_spins", params);
}

export type AdminListMemberOperationLogsParams = {
  p_search?: string;
  p_action?: string;
  p_date_from?: string;
  p_limit: number;
  p_offset: number;
};

export type AdminListMemberOperationLogsResult = {
  success?: boolean;
  logs?: unknown[];
  total?: number;
};

export async function adminListMemberOperationLogs(
  params: AdminListMemberOperationLogsParams,
): Promise<AdminListMemberOperationLogsResult> {
  return apiPost<AdminListMemberOperationLogsResult>("/api/data/rpc/admin_list_member_operation_logs", params);
}

export type AdminListMemberLoginLogsParams = {
  p_search?: string;
  p_date_from?: string;
  p_limit: number;
  p_offset: number;
};

export type AdminListMemberLoginLogsResult = {
  success?: boolean;
  logs?: unknown[];
  total?: number;
};

export async function adminListMemberLoginLogs(
  params: AdminListMemberLoginLogsParams,
): Promise<AdminListMemberLoginLogsResult> {
  return apiPost<AdminListMemberLoginLogsResult>("/api/data/rpc/admin_list_member_login_logs", params);
}
