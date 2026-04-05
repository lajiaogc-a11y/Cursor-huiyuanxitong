/**
 * 清理 invite_register_tokens：过期未使用行 + 可选清理久远的已消费行（审计在 invite_register_audit）。
 */
import { execute } from '../../database/index.js';
import { withSchedulerLock } from '../../lib/schedulerLock.js';

const BATCH = 5000;
const MAX_ROUNDS = 500;

function cleanupIntervalMs(): number {
  const n = Number(process.env.INVITE_REGISTER_TOKEN_CLEANUP_INTERVAL_MS);
  if (Number.isFinite(n) && n >= 60_000) return Math.floor(n);
  return 15 * 60 * 1000;
}

/** 已消费 token 保留天数；≤0 表示不清理已消费行 */
function purgeUsedAfterDays(): number {
  const n = Number(process.env.INVITE_REGISTER_TOKEN_PURGE_USED_AFTER_DAYS);
  if (!Number.isFinite(n)) return 90;
  return Math.min(3650, Math.floor(n));
}

export async function purgeExpiredInviteRegisterTokens(): Promise<{
  expired_unused: number;
  old_consumed: number;
}> {
  let expired_unused = 0;
  for (let i = 0; i < MAX_ROUNDS; i++) {
    const r = await execute(
      `DELETE FROM invite_register_tokens WHERE used_at IS NULL AND expires_at < NOW(3) LIMIT ?`,
      [BATCH],
    );
    const n = r.affectedRows ?? 0;
    expired_unused += n;
    if (n < BATCH) break;
  }

  let old_consumed = 0;
  const usedDays = purgeUsedAfterDays();
  if (usedDays > 0) {
    for (let i = 0; i < MAX_ROUNDS; i++) {
      const r = await execute(
        `DELETE FROM invite_register_tokens
         WHERE used_at IS NOT NULL AND used_at < DATE_SUB(NOW(3), INTERVAL ? DAY) LIMIT ?`,
        [usedDays, BATCH],
      );
      const n = r.affectedRows ?? 0;
      old_consumed += n;
      if (n < BATCH) break;
    }
  }

  return { expired_unused, old_consumed };
}

let timer: ReturnType<typeof setInterval> | undefined;

async function lockedPurge(): Promise<void> {
  await withSchedulerLock('token_cleanup', async () => {
    const s = await purgeExpiredInviteRegisterTokens();
    if (s.expired_unused > 0 || s.old_consumed > 0) {
      console.log('[invite_register_tokens_cleanup]', s);
    }
  });
}

export function startInviteRegisterTokenCleanupScheduler(): void {
  if (timer) return;
  void lockedPurge();
  timer = setInterval(() => { void lockedPurge(); }, cleanupIntervalMs());
}

export function stopInviteRegisterTokenCleanupScheduler(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
