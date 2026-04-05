/**
 * Invite leaderboard — business logic (admin fake users, growth settings, member ranking).
 */
import { maskRankingDisplayName } from '../../lib/maskRankingDisplayName.js';
import {
  listFakeUsersForTenant,
  updateFakeUserBaseFields,
  setFakeUserActive,
  resetFakeUserGrowth,
  seedFiftyFakeUsers,
  getFakeUser,
  totalInviteCount,
  deleteAllFakeUsersForTenant,
  randomizeBaseInviteCountsForTenant,
  getGrowthSettingsMerged,
  upsertInviteLeaderboardGrowthSettings,
  resetGrowthCycleForTenant,
  queryMergedRankingCandidates,
  type InviteFakeUserRow,
  type InviteLeaderboardGrowthScheduleDto,
} from './repository.js';
import { runInviteLeaderboardFakeGrowthJob } from './fakeGrowthJob.js';

export type InviteFakeUserSerialized = {
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

export type InviteGrowthSettingsSerialized = {
  auto_growth_enabled: boolean;
  growth_segment_hours: number;
  growth_delta_min: number;
  growth_delta_max: number;
  growth_segment_started_at: string | null;
  last_fake_growth_at: string | null;
  next_fake_growth_at: string | null;
};

export type InviteRankingEntry = {
  name: string;
  invite_count: number;
  is_fake: boolean;
};

export function serializeFakeRow(r: InviteFakeUserRow): InviteFakeUserSerialized {
  return {
    id: r.id,
    name: r.name,
    base_invite_count: r.base_invite_count,
    auto_increment_count: r.auto_increment_count,
    total_invite_count: totalInviteCount(r),
    growth_cycles: r.growth_cycles,
    max_growth_cycles: r.max_growth_cycles,
    is_active: !!r.is_active,
    next_growth_at: r.next_growth_at ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function serializeGrowthSettings(d: InviteLeaderboardGrowthScheduleDto): InviteGrowthSettingsSerialized {
  return {
    auto_growth_enabled: d.auto_growth_enabled,
    growth_segment_hours: d.growth_segment_hours,
    growth_delta_min: d.growth_delta_min,
    growth_delta_max: d.growth_delta_max,
    growth_segment_started_at: d.growth_segment_started_at,
    last_fake_growth_at: d.last_fake_growth_at,
    next_fake_growth_at: d.next_fake_growth_at,
  };
}

export async function listInviteLeaderboardFakeUsers(tenantId: string): Promise<InviteFakeUserSerialized[]> {
  const rows = await listFakeUsersForTenant(tenantId);
  return rows.map(serializeFakeRow);
}

export type PatchFakeUserOutcome =
  | { ok: true; before: InviteFakeUserSerialized; after: InviteFakeUserSerialized | null }
  | { ok: false; error: 'NOT_FOUND' | 'NO_CHANGES' };

export async function patchInviteLeaderboardFakeUser(
  tenantId: string,
  id: string,
  patch: { name?: string; base_invite_count?: number },
): Promise<PatchFakeUserOutcome> {
  const beforeRow = await getFakeUser(tenantId, id);
  if (!beforeRow) return { ok: false, error: 'NOT_FOUND' };
  const changed = await updateFakeUserBaseFields(tenantId, id, patch);
  if (!changed) return { ok: false, error: 'NO_CHANGES' };
  const afterRow = await getFakeUser(tenantId, id);
  return {
    ok: true,
    before: serializeFakeRow(beforeRow),
    after: afterRow ? serializeFakeRow(afterRow) : null,
  };
}

export type ToggleFakeUserOutcome =
  | { ok: true; before: InviteFakeUserSerialized; after: InviteFakeUserSerialized | null }
  | { ok: false; error: 'NOT_FOUND' };

export async function toggleInviteLeaderboardFakeUserActive(
  tenantId: string,
  id: string,
  isActive: boolean,
): Promise<ToggleFakeUserOutcome> {
  const beforeRow = await getFakeUser(tenantId, id);
  if (!beforeRow) return { ok: false, error: 'NOT_FOUND' };
  await setFakeUserActive(tenantId, id, isActive);
  const afterRow = await getFakeUser(tenantId, id);
  return {
    ok: true,
    before: serializeFakeRow(beforeRow),
    after: afterRow ? serializeFakeRow(afterRow) : null,
  };
}

export type ResetGrowthOneOutcome =
  | { ok: true; before: InviteFakeUserSerialized; after: InviteFakeUserSerialized | null }
  | { ok: false; error: 'NOT_FOUND' };

export async function resetInviteLeaderboardFakeUserGrowth(
  tenantId: string,
  id: string,
): Promise<ResetGrowthOneOutcome> {
  const beforeRow = await getFakeUser(tenantId, id);
  if (!beforeRow) return { ok: false, error: 'NOT_FOUND' };
  await resetFakeUserGrowth(tenantId, id);
  const afterRow = await getFakeUser(tenantId, id);
  return {
    ok: true,
    before: serializeFakeRow(beforeRow),
    after: afterRow ? serializeFakeRow(afterRow) : null,
  };
}

export async function deleteAllInviteLeaderboardFakes(tenantId: string): Promise<{ deleted: number }> {
  const deleted = await deleteAllFakeUsersForTenant(tenantId);
  return { deleted };
}

export async function randomizeInviteLeaderboardFakeBaseCounts(
  tenantId: string,
  min: number,
  max: number,
): Promise<{ updated: number; min: number; max: number }> {
  const updated = await randomizeBaseInviteCountsForTenant(tenantId, min, max);
  return { updated, min, max };
}

export type SeedFakeUsersOutcome = { ok: true; inserted: number } | { ok: false; error: 'ALREADY_SEEDED' };

export async function seedInviteLeaderboardFakeUsers(
  tenantId: string,
  replace: boolean,
): Promise<SeedFakeUsersOutcome> {
  const { inserted } = await seedFiftyFakeUsers(tenantId, replace);
  if (!replace && inserted === 0) {
    return { ok: false, error: 'ALREADY_SEEDED' };
  }
  return { ok: true, inserted };
}

export async function getInviteLeaderboardGrowthSettingsDto(tenantId: string): Promise<InviteGrowthSettingsSerialized> {
  const row = await getGrowthSettingsMerged(tenantId);
  return serializeGrowthSettings(row);
}

export type PatchGrowthSettingsOutcome =
  | { ok: true; before: InviteGrowthSettingsSerialized; after: InviteGrowthSettingsSerialized }
  | { ok: false; error: 'EMPTY_PATCH' };

export async function patchInviteLeaderboardGrowthSettings(
  tenantId: string,
  patch: {
    auto_growth_enabled?: boolean;
    growth_segment_hours?: number;
    growth_delta_min?: number;
    growth_delta_max?: number;
  },
): Promise<PatchGrowthSettingsOutcome> {
  if (Object.keys(patch).length === 0) return { ok: false, error: 'EMPTY_PATCH' };
  const before = await getGrowthSettingsMerged(tenantId);
  const after = await upsertInviteLeaderboardGrowthSettings(tenantId, patch);
  return {
    ok: true,
    before: serializeGrowthSettings(before),
    after: serializeGrowthSettings(after),
  };
}

export async function runInviteLeaderboardGrowthJobNow() {
  return runInviteLeaderboardFakeGrowthJob();
}

export async function resetInviteLeaderboardGrowthCycle(tenantId: string): Promise<{
  before: InviteGrowthSettingsSerialized;
  after: InviteGrowthSettingsSerialized;
}> {
  const before = await getGrowthSettingsMerged(tenantId);
  const after = await resetGrowthCycleForTenant(tenantId);
  return {
    before: serializeGrowthSettings(before),
    after: serializeGrowthSettings(after),
  };
}

export async function getInviteRankingTop5(tenantId: string): Promise<InviteRankingEntry[]> {
  const rows = await queryMergedRankingCandidates(tenantId);
  const top = rows.slice(0, 5);
  return top.map((r) => {
    const label = String(r.display_name || '').trim() || '—';
    return {
      name: maskRankingDisplayName(label),
      invite_count: Math.max(0, Math.floor(Number(r.invite_count) || 0)),
      is_fake: r.kind === 'fake',
    };
  });
}
