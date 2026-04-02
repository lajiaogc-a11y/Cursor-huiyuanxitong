import type { Request, Response } from 'express';
import { config } from '../../config/index.js';
import { getInternalJobSecret, timingSafeStringEqual } from '../../lib/internalCronAuth.js';
import { runDataBackup } from './service.js';

/**
 * POST /api/internal/backup/run
 * 供系统 cron / 任务计划程序调用，无需员工 JWT。
 * 请求头：X-Backup-Cron-Secret: <BACKUP_CRON_SECRET> 或 Authorization: Bearer <BACKUP_CRON_SECRET>
 */
export async function postInternalBackupRunController(req: Request, res: Response): Promise<void> {
  const expected = config.backup.cronSecret;
  if (!expected) {
    res.status(503).json({ success: false, error: 'BACKUP_CRON_SECRET not configured' });
    return;
  }
  const provided = getInternalJobSecret(req, 'x-backup-cron-secret');
  if (!provided || !timingSafeStringEqual(provided, expected)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const body = (req.body || {}) as { created_by_name?: string };
  const createdByName =
    typeof body.created_by_name === 'string' && body.created_by_name.trim()
      ? body.created_by_name.trim().slice(0, 255)
      : '定时任务';

  try {
    const result = await runDataBackup({ triggerType: 'auto', createdByName });
    res.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Backup failed';
    res.status(500).json({ success: false, error: msg });
  }
}
