/**
 * 定时执行已启用租户的邀请会员自动清理（每 24h）
 */
import { runCleanupForAllEnabledTenants } from './service.js';
import { withSchedulerLock } from '../../lib/schedulerLock.js';

const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | undefined;

export function startMemberDataCleanupScheduler(): void {
  if (timer) return;
  void withSchedulerLock('member_data_cleanup', () => runCleanupForAllEnabledTenants());
  timer = setInterval(() => {
    void withSchedulerLock('member_data_cleanup', () => runCleanupForAllEnabledTenants());
  }, TWENTY_FOUR_H_MS);
}

export function stopMemberDataCleanupScheduler(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
