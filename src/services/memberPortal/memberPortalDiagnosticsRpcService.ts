/**
 * 员工端「会员门户设置」内嵌诊断：抽奖记录、会员操作日志等 RPC
 */
import { memberAdminApi } from "@/api/memberAdmin";

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
  return memberAdminApi.listSpins(params) as Promise<AdminListSpinsResult>;
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
  return memberAdminApi.listMemberOperationLogs(params) as Promise<AdminListMemberOperationLogsResult>;
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
  return memberAdminApi.listMemberLoginLogs(params) as Promise<AdminListMemberLoginLogsResult>;
}
