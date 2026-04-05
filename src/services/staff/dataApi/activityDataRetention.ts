import { apiClient } from "@/lib/apiClient";

export interface ActivityDataRetentionLastSummary {
  lotteryLogs: number;
  checkIns: number;
  lotteryPointsLedger: number;
  spinCreditsOrder: number;
  spinCreditsShare: number;
  spinCreditsInvite: number;
  spinCreditsOther: number;
  mallRedemptions: number;
}

export interface ActivityDataRetentionSettings {
  enabled: boolean;
  retentionDays: number;
  lastRunAt: string | null;
  lastSummary: ActivityDataRetentionLastSummary | null;
}

export async function getActivityDataRetentionApi(
  tenantId?: string | null,
): Promise<ActivityDataRetentionSettings> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  return apiClient.get<ActivityDataRetentionSettings>(`/api/data/activity-data-retention${q}`);
}

export async function putActivityDataRetentionApi(
  tenantId: string | null | undefined,
  payload: { enabled: boolean; retentionDays: number },
): Promise<ActivityDataRetentionSettings> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  return apiClient.put<ActivityDataRetentionSettings>(
    `/api/data/activity-data-retention${q}`,
    payload,
  );
}

export async function postActivityDataRetentionRunApi(tenantId?: string | null): Promise<{
  summary: ActivityDataRetentionLastSummary;
  settings: ActivityDataRetentionSettings;
}> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  return apiClient.post(`/api/data/activity-data-retention/run${q}`, {});
}

export async function postActivityDataRetentionPurgeAllApi(tenantId?: string | null): Promise<{
  summary: ActivityDataRetentionLastSummary;
}> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  return apiClient.post(`/api/data/activity-data-retention/purge-all${q}`, {});
}
