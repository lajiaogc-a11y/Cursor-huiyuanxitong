/**
 * 租户假人池：DB 自定义优先，否则内置 100 人；进程内缓存，保存设置后失效。
 */
import type { SpinFakeUser } from './spinFakeUserPool.js';
import { SPIN_FAKE_USER_POOL_BUILTIN } from './spinFakeUserPool.js';
import { coerceMysqlJsonToArray } from './spinFakeNicknameParse.js';
import { getLotterySimFakeSettingsRow } from './simFakeSettingsRepository.js';

const cache = new Map<string, SpinFakeUser[]>();

export function invalidateSpinFakePoolCache(tenantId: string): void {
  cache.delete(tenantId);
}

function jsonToUsers(parsed: unknown): SpinFakeUser[] | null {
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const out: SpinFakeUser[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!id || !name) continue;
    out.push({
      id,
      name,
      avatar: null,
      region: null,
      is_fake: true,
    });
  }
  return out.length === 100 ? out : out.length > 0 ? out : null;
}

export async function getResolvedSpinFakeUsersForTenant(tenantId: string): Promise<SpinFakeUser[]> {
  const hit = cache.get(tenantId);
  if (hit && hit.length === 100) return hit;

  const row = await getLotterySimFakeSettingsRow(tenantId);
  if (row?.pool_json != null) {
    const arr = coerceMysqlJsonToArray(row.pool_json as unknown);
    const users = arr ? jsonToUsers(arr) : null;
    if (users && users.length === 100) {
      cache.set(tenantId, users);
      return users;
    }
  }

  cache.set(tenantId, SPIN_FAKE_USER_POOL_BUILTIN);
  return SPIN_FAKE_USER_POOL_BUILTIN;
}
