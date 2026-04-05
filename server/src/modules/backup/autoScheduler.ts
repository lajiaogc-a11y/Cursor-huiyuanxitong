import { config } from '../../config/index.js';
import { runDataBackup } from './service.js';
import { withSchedulerLock } from '../../lib/schedulerLock.js';

let timer: ReturnType<typeof setInterval> | undefined;

export function startAutoBackupScheduler(): void {
  const ms = config.backup.autoIntervalMs;
  if (ms <= 0) return;
  console.log(`[Backup] BACKUP_AUTO_INTERVAL_MS=${ms} — in-process auto backup enabled`);
  timer = setInterval(() => {
    void withSchedulerLock('auto_backup', async () => {
      try {
        await runDataBackup({ triggerType: 'auto', createdByName: 'Scheduled task' });
        console.log('[Backup] Auto backup completed');
      } catch (e) {
        console.error('[Backup] Auto backup failed:', (e as Error).message);
      }
    });
  }, ms);
}

export function stopAutoBackupScheduler(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
