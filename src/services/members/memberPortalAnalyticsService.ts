import { apiGet, apiPut, apiPost } from "@/api/client";

export interface MemberPortalWebsiteStats {
  /** 统计口径标识，固定为 invite_register，表示仅含自助注册链接来源 */
  scope?: 'invite_register';
  scope_description?: string;
  data_source_description?: string;
  calendar_today: string;
  range: { start_date: string; end_date: string };
  online_now: number;
  today: {
    login_users: number;
    register_count: number;
    trading_users: number;
  };
  in_range: {
    login_users: number;
    register_count: number;
    trading_users: number;
    total_transaction_amount: number;
    card_value_sum: number;
  };
  /** 截至范围结束日，仅含 invite_register 来源的累积会员数 */
  cumulative_invite_registers: number;
  /** 与 cumulative_invite_registers 相同（推荐使用该字段名） */
  cumulative_members?: number;
}

/**
 * 路径前缀：使用 site-data 替代 analytics，
 * 避免被浏览器广告拦截/隐私插件按 EasyPrivacy 规则阻断。
 */
const BASE = "/api/member-portal/site-data";

function tenantQs(tenantId: string | null | undefined): string {
  return tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
}

export async function getMemberPortalWebsiteStats(
  tenantId: string | null | undefined,
  startDate?: string,
  endDate?: string,
): Promise<MemberPortalWebsiteStats> {
  const q = new URLSearchParams();
  if (tenantId) q.set("tenant_id", tenantId);
  if (startDate) q.set("start_date", startDate);
  if (endDate) q.set("end_date", endDate);
  const qs = q.toString();
  return apiGet<MemberPortalWebsiteStats>(`${BASE}/stats${qs ? `?${qs}` : ""}`);
}

export interface DataCleanupSettings {
  enabled: boolean;
  no_trade_months: number | null;
  no_login_months: number | null;
  max_points_below: number | null;
}

export async function getMemberPortalDataCleanupSettings(tenantId: string | null | undefined): Promise<DataCleanupSettings> {
  return apiGet<DataCleanupSettings>(`${BASE}/data-cleanup${tenantQs(tenantId)}`);
}

export async function putMemberPortalDataCleanupSettings(
  tenantId: string | null | undefined,
  body: DataCleanupSettings,
): Promise<void> {
  await apiPut(`${BASE}/data-cleanup${tenantQs(tenantId)}`, body);
}

export async function previewMemberPortalDataCleanup(tenantId: string | null | undefined): Promise<{ count: number }> {
  return apiGet<{ count: number }>(
    `${BASE}/data-cleanup/preview${tenantQs(tenantId)}`,
  );
}

export async function runMemberPortalDataCleanup(
  tenantId: string | null | undefined,
): Promise<{ matched: number; purged: number }> {
  return apiPost<{ matched: number; purged: number }>(
    `${BASE}/data-cleanup/run${tenantQs(tenantId)}`,
  );
}
