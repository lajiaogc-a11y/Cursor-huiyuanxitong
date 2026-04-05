/**
 * 抽奖假人：可选每小时一轮（enable_cron_fake_feed），在 1 小时内按秒分散若干次模拟抽奖；
 * 次数与进入滚动的名次区间见 lottery_simulation_settings；展示间隔 10~30s；避免同一假人连续上屏。
 * 展示数据写入 lottery_simulation_feed（非 lottery_logs）。
 */
import { randomInt } from 'node:crypto';
import { query, execute } from '../../database/index.js';
import { logger } from '../../lib/logger.js';
import { withSchedulerLock } from '../../lib/schedulerLock.js';
import { getShanghaiHourKey, msUntilNextShanghaiHourBoundary } from '../../lib/shanghaiTime.js';
import { simulateLotteryDrawForTenant } from './service.js';
import type { SpinFakeUser } from './spinFakeUserPool.js';
import { getResolvedSpinFakeUsersForTenant } from './simFakePoolResolver.js';
import {
  getSimulationSettingsRow,
  insertSimulationFeedRow,
  purgeSimulationFeedOlderThan,
  setCronFakeAnchorAt,
  type SimulationSettingsResolved,
} from './simulationFeedRepository.js';
import { maskSpinSimDisplayName } from './spinFakeNicknameParse.js';
import { formatSpinSimulationCongratsLine } from './spinSimulationFeedText.js';
const MIN_GAP_MS = 10_000;
const MAX_GAP_MS = 30_000;

type Pending = { user: SpinFakeUser; rank: number; prizeName: string };

interface TenantFeedState {
  pending: Pending[];
  lastShownFakeId: string | null;
  nextEmitAt: number;
}

const feeds = new Map<string, TenantFeedState>();

function ensureFeed(tenantId: string): TenantFeedState {
  let s = feeds.get(tenantId);
  if (!s) {
    s = { pending: [], lastShownFakeId: null, nextEmitAt: 0 };
    feeds.set(tenantId, s);
  }
  return s;
}

export function pushSpinSimPending(tenantId: string, p: Pending): void {
  ensureFeed(tenantId).pending.push(p);
}

function pickUniqueOffsets(count: number, maxExclusive: number): number[] {
  const arr = Array.from({ length: maxExclusive }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr.slice(0, count).sort((a, b) => a - b);
}

function shuffleUsers(users: SpinFakeUser[]): SpinFakeUser[] {
  const a = [...users];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export async function tickEmitQueuesOnce(): Promise<void> {
  const now = Date.now();
  for (const [tenantId, st] of feeds) {
    if (now < st.nextEmitAt || st.pending.length === 0) continue;

    let picked: Pending | null = null;
    let rotations = 0;
    const maxRot = Math.max(st.pending.length * 2, 1);
    while (st.pending.length > 0 && rotations < maxRot) {
      const cand = st.pending[0]!;
      if (cand.user.id === st.lastShownFakeId) {
        st.pending.push(st.pending.shift()!);
        rotations++;
        continue;
      }
      picked = st.pending.shift()!;
      break;
    }
    if (!picked) continue;

    st.lastShownFakeId = picked.user.id;
    const masked = maskSpinSimDisplayName(picked.user.name);
    const text = formatSpinSimulationCongratsLine(masked, picked.prizeName);
    st.nextEmitAt = now + randomInt(MIN_GAP_MS, MAX_GAP_MS + 1);

    try {
      await insertSimulationFeedRow(tenantId, 'cron_fake', text, null);
    } catch (e) {
      logger.warn('spin_fake', 'feed insert', tenantId, (e as Error).message);
    }
  }
}

let emitTimer: ReturnType<typeof setInterval> | undefined;
let hourTimer: ReturnType<typeof setTimeout> | undefined;
let anchorTimer: ReturnType<typeof setInterval> | undefined;

export async function tryClaimSpinFakeHour(tenantId: string, hourKey: string): Promise<boolean> {
  try {
    await execute(
      'INSERT INTO spin_fake_lottery_hour_run (tenant_id, hour_key, created_at) VALUES (?, ?, NOW(3))',
      [tenantId, hourKey],
    );
    return true;
  } catch (e: unknown) {
    const msg = (e as Error).message || '';
    if (msg.includes('Duplicate') || msg.includes('duplicate') || msg.includes('ER_DUP_ENTRY')) {
      return false;
    }
    throw e;
  }
}

async function listTenantIdsWithSpinPrizes(): Promise<string[]> {
  const rows = await query<{ tenant_id: string }>(
    `SELECT DISTINCT tenant_id AS tenant_id FROM lottery_prizes
     WHERE tenant_id IS NOT NULL AND enabled = 1`,
  );
  return rows.map((r) => String(r.tenant_id)).filter(Boolean);
}

async function runOneFakeUserDraw(
  tenantId: string,
  user: SpinFakeUser,
  rankMin: number,
  rankMax: number,
): Promise<void> {
  try {
    const r = await simulateLotteryDrawForTenant(tenantId);
    if (!r.ok || !r.prize || r.rank == null) return;
    const { rank } = r;
    if (rank < rankMin || rank > rankMax) return;
    pushSpinSimPending(tenantId, { user, rank, prizeName: r.prize.name });
  } catch (e) {
    logger.warn('spin_fake', 'draw', tenantId, (e as Error).message);
  }
}

/** 按后台配置的次数与名次区间，在 3600 秒内分散调度假人抽奖 */
export function scheduleCronFakeDrawsForTenant(
  tenantId: string,
  users: SpinFakeUser[],
  sim: Pick<SimulationSettingsResolved, 'cron_fake_draws_per_hour' | 'sim_feed_rank_min' | 'sim_feed_rank_max'>,
): void {
  const cap = Math.max(0, Math.min(100, Math.floor(Number(sim.cron_fake_draws_per_hour) || 0)));
  if (cap <= 0 || users.length === 0) return;
  const n = Math.min(cap, users.length);
  const rMin = sim.sim_feed_rank_min;
  const rMax = sim.sim_feed_rank_max;
  const offsets = pickUniqueOffsets(n, 3600);
  const shuffled = shuffleUsers(users.slice(0, n));
  const pairs = offsets.map((sec, i) => ({ sec, user: shuffled[i]! }));
  pairs.sort((a, b) => a.sec - b.sec);
  for (const { sec, user } of pairs) {
    setTimeout(() => {
      void runOneFakeUserDraw(tenantId, user, rMin, rMax);
    }, sec * 1000);
  }
}

export async function runSpinFakeLotteryHourJob(): Promise<void> {
  const hourKey = getShanghaiHourKey();
  const tenants = await listTenantIdsWithSpinPrizes();
  let scheduled = 0;
  for (const tenantId of tenants) {
    const sim = await getSimulationSettingsRow(tenantId);
    if (!sim.enable_cron_fake_feed) continue;
    if (sim.cron_fake_anchor_at) continue;
    const claimed = await tryClaimSpinFakeHour(tenantId, hourKey);
    if (!claimed) continue;
    await purgeSimulationFeedOlderThan(tenantId, sim.retention_days);
    const users = await getResolvedSpinFakeUsersForTenant(tenantId);
    scheduleCronFakeDrawsForTenant(tenantId, users, sim);
    scheduled++;
  }
  if (scheduled > 0) {
    logger.info('spin_fake', `hour=${hourKey} tenants_scheduled=${scheduled}`);
  }
}

/** 锚点模式：每分钟检查，按「锚点起第 N 个整点小时」认领并调度一批假人抽奖 */
export async function runSpinFakeAnchorModeTick(): Promise<void> {
  const rows = await query<{
    tenant_id: string;
    cron_fake_anchor_at: Date | string;
  }>(
    `SELECT s.tenant_id, s.cron_fake_anchor_at
     FROM lottery_simulation_settings s
     INNER JOIN (
       SELECT DISTINCT tenant_id FROM lottery_prizes
       WHERE tenant_id IS NOT NULL AND enabled = 1
     ) p ON p.tenant_id = s.tenant_id
     WHERE s.enable_cron_fake_feed = 1 AND s.cron_fake_anchor_at IS NOT NULL`,
  );
  const now = Date.now();
  let scheduled = 0;
  for (const r of rows) {
    const tenantId = String(r.tenant_id);
    const anchorMs = new Date(r.cron_fake_anchor_at as Date).getTime();
    if (!Number.isFinite(anchorMs)) continue;
    const slot = Math.floor((now - anchorMs) / 3600000);
    if (slot < 0) continue;
    const hourKey = `${Math.floor(anchorMs / 1000)}:${slot}`;
    const claimed = await tryClaimSpinFakeHour(tenantId, hourKey);
    if (!claimed) continue;
    const sim = await getSimulationSettingsRow(tenantId);
    await purgeSimulationFeedOlderThan(tenantId, sim.retention_days);
    const users = await getResolvedSpinFakeUsersForTenant(tenantId);
    scheduleCronFakeDrawsForTenant(tenantId, users, sim);
    scheduled++;
  }
  if (scheduled > 0) {
    logger.info('spin_fake', `anchor_tick tenants_scheduled=${scheduled}`);
  }
}

/**
 * 管理端「模拟执行」：认领当前秒 slot0、写入锚点、立即调度首轮（与后续每小时锚点轮询衔接）。
 * 须已开启「每小时自动生成」且租户有启用奖品。
 */
export async function manualStartSpinFakeCronForTenant(
  tenantId: string,
): Promise<{ ok: true } | { ok: false; code: string }> {
  const sim = await getSimulationSettingsRow(tenantId);
  if (!sim.enable_cron_fake_feed) {
    return { ok: false, code: 'ENABLE_CRON_FIRST' };
  }
  if (sim.cron_fake_anchor_at) {
    return { ok: false, code: 'ANCHOR_ALREADY_SET' };
  }
  const tenants = await listTenantIdsWithSpinPrizes();
  if (!tenants.includes(tenantId)) {
    return { ok: false, code: 'NO_PRIZES' };
  }
  const anchorMs = Date.now();
  const hourKey = `${Math.floor(anchorMs / 1000)}:0`;
  const claimed = await tryClaimSpinFakeHour(tenantId, hourKey);
  if (!claimed) {
    return { ok: false, code: 'SLOT0_BUSY' };
  }
  await setCronFakeAnchorAt(tenantId, new Date(anchorMs));
  await purgeSimulationFeedOlderThan(tenantId, sim.retention_days);
  const users = await getResolvedSpinFakeUsersForTenant(tenantId);
  scheduleCronFakeDrawsForTenant(tenantId, users, sim);
  return { ok: true };
}

function scheduleNextHourlyRun(): void {
  const wait = msUntilNextShanghaiHourBoundary();
  hourTimer = setTimeout(() => {
    void withSchedulerLock('spin_fake_hour', () => runSpinFakeLotteryHourJob())
      .catch((e) => logger.warn('spin_fake', 'hour job', (e as Error).message || e))
      .finally(() => {
        scheduleNextHourlyRun();
      });
  }, wait);
}

export function startSpinFakeLotteryScheduler(): void {
  if (process.env.SPIN_FAKE_LOTTERY_ENABLED === '0') {
    logger.info('spin_fake', 'SPIN_FAKE_LOTTERY_ENABLED=0 — scheduler off');
    return;
  }
  if (emitTimer) return;
  emitTimer = setInterval(() => {
    void tickEmitQueuesOnce().catch((e) => console.warn('[spin_fake] emit', (e as Error).message));
  }, 500);
  scheduleNextHourlyRun();
  anchorTimer = setInterval(() => {
    void withSchedulerLock('spin_fake_anchor', () => runSpinFakeAnchorModeTick()).catch((e) =>
      logger.warn('spin_fake', 'anchor tick', (e as Error).message || e),
    );
  }, 60_000);
  void withSchedulerLock('spin_fake_anchor', () => runSpinFakeAnchorModeTick()).catch((e) =>
    logger.warn('spin_fake', 'anchor tick (boot)', (e as Error).message || e),
  );
}

export function stopSpinFakeLotteryScheduler(): void {
  if (emitTimer) clearInterval(emitTimer);
  emitTimer = undefined;
  if (hourTimer) clearTimeout(hourTimer);
  hourTimer = undefined;
  if (anchorTimer) clearInterval(anchorTimer);
  anchorTimer = undefined;
}
