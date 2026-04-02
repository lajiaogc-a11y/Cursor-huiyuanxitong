/**
 * 已启用自动清理的租户：每 24h 执行一次活动数据保留策略
 */
import {
  listTenantIdsWithActivityRetentionEnabledRepository,
  runActivityDataRetentionForTenantRepository,
} from './activityDataRetentionRepository.js';

const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | undefined;

async function runAll(): Promise<void> {
  const ids = await listTenantIdsWithActivityRetentionEnabledRepository();
  for (const tid of ids) {
    try {
      const r = await runActivityDataRetentionForTenantRepository(tid);
      if (
        r.ran &&
        (r.summary.lotteryLogs > 0 ||
          r.summary.checkIns > 0 ||
          r.summary.lotteryPointsLedger > 0)
      ) {
        console.log(`[activity_data_retention] tenant ${tid}:`, r.summary);
      }
    } catch (e) {
      console.warn(`[activity_data_retention] tenant ${tid} failed:`, (e as Error).message);
    }
  }
}

export function startActivityDataRetentionScheduler(): void {
  if (timer) return;
  void runAll();
  timer = setInterval(() => {
    void runAll();
  }, TWENTY_FOUR_H_MS);
}

export function stopActivityDataRetentionScheduler(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
