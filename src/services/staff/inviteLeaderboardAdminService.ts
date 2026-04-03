import { apiGetAsStaff, apiPostAsStaff, apiPatchAsStaff } from "@/api/client";

export type InviteLeaderboardGrowthSettings = {
  auto_growth_enabled: boolean;
  growth_segment_hours: number;
  growth_delta_min: number;
  growth_delta_max: number;
  growth_segment_started_at: string | null;
  last_fake_growth_at: string | null;
  next_fake_growth_at: string | null;
};

export type InviteLeaderboardGrowthSettingsPatch = Partial<
  Pick<
    InviteLeaderboardGrowthSettings,
    | "auto_growth_enabled"
    | "growth_segment_hours"
    | "growth_delta_min"
    | "growth_delta_max"
  >
>;

export type InviteLeaderboardFakeRow = {
  id: string;
  name: string;
  base_invite_count: number;
  auto_increment_count: number;
  total_invite_count: number;
  growth_cycles: number;
  max_growth_cycles: number;
  is_active: boolean;
  next_growth_at: string | null;
  created_at: string;
  updated_at: string;
};

function tenantQs(tenantId: string | null): string {
  return tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
}

export async function staffGetInviteLeaderboardGrowthSettings(
  tenantId: string | null,
): Promise<InviteLeaderboardGrowthSettings | null> {
  const res = await apiGetAsStaff<unknown>(
    `/api/member-portal-settings/invite-leaderboard/growth-settings${tenantQs(tenantId)}`,
  );
  const o = res as { settings?: InviteLeaderboardGrowthSettings };
  return o.settings ?? null;
}

export async function staffPatchInviteLeaderboardGrowthSettings(
  tenantId: string | null,
  body: InviteLeaderboardGrowthSettingsPatch,
): Promise<InviteLeaderboardGrowthSettings | null> {
  const res = await apiPatchAsStaff<unknown>(
    `/api/member-portal-settings/invite-leaderboard/growth-settings${tenantQs(tenantId)}`,
    body,
  );
  const o = res as { settings?: InviteLeaderboardGrowthSettings };
  return o.settings ?? null;
}

export async function staffListInviteLeaderboardFakes(tenantId: string | null): Promise<InviteLeaderboardFakeRow[]> {
  const res = await apiGetAsStaff<unknown>(`/api/member-portal-settings/invite-leaderboard/fake-users${tenantQs(tenantId)}`);
  const o = res as { rows?: InviteLeaderboardFakeRow[] };
  return Array.isArray(o.rows) ? o.rows : [];
}

export async function staffPatchInviteLeaderboardFake(
  tenantId: string | null,
  id: string,
  body: { name?: string; base_invite_count?: number },
): Promise<InviteLeaderboardFakeRow | null> {
  const res = await apiPatchAsStaff<unknown>(
    `/api/member-portal-settings/invite-leaderboard/fake-users/${encodeURIComponent(id)}${tenantQs(tenantId)}`,
    body,
  );
  const o = res as { row?: InviteLeaderboardFakeRow };
  return o.row ?? null;
}

export async function staffToggleInviteLeaderboardFake(
  tenantId: string | null,
  id: string,
  is_active: boolean,
): Promise<InviteLeaderboardFakeRow | null> {
  const res = await apiPostAsStaff<unknown>(
    `/api/member-portal-settings/invite-leaderboard/fake-users/${encodeURIComponent(id)}/toggle${tenantQs(tenantId)}`,
    { is_active },
  );
  const o = res as { row?: InviteLeaderboardFakeRow };
  return o.row ?? null;
}

export async function staffResetInviteLeaderboardFakeGrowth(
  tenantId: string | null,
  id: string,
): Promise<InviteLeaderboardFakeRow | null> {
  const res = await apiPostAsStaff<unknown>(
    `/api/member-portal-settings/invite-leaderboard/fake-users/${encodeURIComponent(id)}/reset-growth${tenantQs(tenantId)}`,
    {},
  );
  const o = res as { row?: InviteLeaderboardFakeRow };
  return o.row ?? null;
}

export async function staffSeedInviteLeaderboardFakes(
  tenantId: string | null,
  replace: boolean,
): Promise<{ inserted: number }> {
  const res = await apiPostAsStaff<unknown>(
    `/api/member-portal-settings/invite-leaderboard/seed${tenantQs(tenantId)}`,
    { replace },
  );
  const o = res as { inserted?: number };
  return { inserted: Number(o.inserted ?? 0) };
}

export async function staffRunInviteLeaderboardGrowthNow(): Promise<{
  success: boolean;
  message?: string;
  fake_rows_updated?: number;
}> {
  const res = await apiPostAsStaff<{
    success?: boolean;
    message?: string;
    fake_rows_updated?: number;
  }>("/api/member-portal-settings/invite-leaderboard/run-growth-now", {});
  return {
    success: res?.success !== false,
    message: typeof res?.message === "string" ? res.message : undefined,
    fake_rows_updated: typeof res?.fake_rows_updated === "number" ? res.fake_rows_updated : undefined,
  };
}

export async function staffDeleteAllInviteLeaderboardFakes(tenantId: string | null): Promise<{ deleted: number }> {
  const res = await apiPostAsStaff<unknown>(
    `/api/member-portal-settings/invite-leaderboard/fake-users/delete-all${tenantQs(tenantId)}`,
    {},
  );
  const o = res as { deleted?: number };
  return { deleted: Number(o.deleted ?? 0) };
}

export async function staffRandomizeInviteLeaderboardFakeBase(
  tenantId: string | null,
  min = 1,
  max = 3,
): Promise<{ updated: number; min: number; max: number }> {
  const res = await apiPostAsStaff<unknown>(
    `/api/member-portal-settings/invite-leaderboard/fake-users/randomize-base${tenantQs(tenantId)}`,
    { min, max },
  );
  const o = res as { updated?: number; min?: number; max?: number };
  return {
    updated: Number(o.updated ?? 0),
    min: Number(o.min ?? min),
    max: Number(o.max ?? max),
  };
}
