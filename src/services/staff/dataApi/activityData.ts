import { apiClient } from "@/lib/apiClient";

export interface ActivityDataResult {
  gifts: unknown[];
  referrals: unknown[];
  memberActivities: unknown[];
  pointsLedgerData: unknown[];
  pointsAccountsData: unknown[];
  spinCreditsData: unknown[];
}

export interface ActivityGiftMutationPayload {
  currency?: string;
  amount?: number | string;
  rate?: number | string;
  phone_number?: string;
  payment_agent?: string | null;
  gift_type?: string | null;
  fee?: number | string | null;
  gift_value?: number | string | null;
  remark?: string | null;
  creator_id?: string | null;
  tenant_id?: string | null;
}

export async function getActivityDataApi(tenantId?: string | null): Promise<ActivityDataResult> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  const res = await apiClient.get<ActivityDataResult>(`/api/data/activity-data${q}`);
  const data = res && typeof res === "object" && "data" in res ? (res as { data?: ActivityDataResult }).data : res;
  const d = (data && typeof data === "object" ? data : {}) as ActivityDataResult;
  return {
    gifts: Array.isArray(d.gifts) ? d.gifts : [],
    referrals: Array.isArray(d.referrals) ? d.referrals : [],
    memberActivities: Array.isArray(d.memberActivities) ? d.memberActivities : [],
    pointsLedgerData: Array.isArray(d.pointsLedgerData) ? d.pointsLedgerData : [],
    pointsAccountsData: Array.isArray(d.pointsAccountsData) ? d.pointsAccountsData : [],
    spinCreditsData: Array.isArray(d.spinCreditsData) ? d.spinCreditsData : [],
  };
}

export async function patchActivityGiftApi(
  id: string,
  payload: ActivityGiftMutationPayload,
): Promise<Record<string, unknown> | null> {
  const res = await apiClient.patch<unknown>(`/api/data/activity-gifts/${encodeURIComponent(id)}`, payload);
  const raw = res as Record<string, unknown>;
  const data = raw?.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : raw;
  return data && typeof data === "object" ? data : null;
}

export interface SpinCreditDetailRow {
  created_at: string;
  amount: number;
  source: string;
  balance_before: number;
  balance_after: number;
}

export interface SpinCreditsDetailResult {
  credits: SpinCreditDetailRow[];
  remaining: number;
  totalEarned: number;
}

export async function getSpinCreditsDetailApi(memberId: string): Promise<SpinCreditsDetailResult> {
  const res = await apiClient.get<SpinCreditsDetailResult>(`/api/data/spin-credits-detail/${encodeURIComponent(memberId)}`);
  const raw = res as Record<string, unknown>;
  const data = (raw?.data && typeof raw.data === "object" ? raw.data : raw) as Record<string, unknown>;
  return {
    credits: Array.isArray(data?.credits) ? data.credits as SpinCreditDetailRow[] : [],
    remaining: Number(data?.remaining ?? 0),
    totalEarned: Number(data?.totalEarned ?? 0),
  };
}

export async function deleteActivityGiftApi(
  id: string,
  tenantId?: string | null,
): Promise<{ gift: Record<string, unknown> | null; restored_points: number }> {
  const q =
    tenantId != null && tenantId !== ''
      ? `?tenant_id=${encodeURIComponent(tenantId)}`
      : '';
  const res = await apiClient.delete<unknown>(`/api/data/activity-gifts/${encodeURIComponent(id)}${q}`);
  const raw = res as Record<string, unknown>;
  const data = raw?.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : raw;
  return {
    gift: data?.gift && typeof data.gift === "object" ? (data.gift as Record<string, unknown>) : null,
    restored_points: Number(data?.restored_points ?? 0) || 0,
  };
}
