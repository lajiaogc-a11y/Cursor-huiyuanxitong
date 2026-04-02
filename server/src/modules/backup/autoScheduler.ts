import { config } from '../../config/index.js';
import { runDataBackup } from './service.js';

let timer: ReturnType<typeof setInterval> | undefined;

export function startAutoBackupScheduler(): void {
  const ms = config.backup.autoIntervalMs;
  if (ms <= 0) return;
  console.log(`[Backup] BACKUP_AUTO_INTERVAL_MS=${ms} — 进程内定时备份已启用`);
  timer = setInterval(() => {
    void (async () => {
      try {
        await runDataBackup({ triggerType: 'auto', createdByName: '定时任务' });
        console.log('[Backup] 进程内定时备份完成');
      } catch (e) {
        console.error('[Backup] 进程内定时备份失败:', (e as Error).message);
      }
    })();
  }, ms);
}

export function stopAutoBackupScheduler(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
