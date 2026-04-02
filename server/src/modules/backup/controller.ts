import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { runDataBackup, readBackupTableJson, deleteBackupFilesAndRecord } from './service.js';

export async function postRunBackupController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const body = (req.body || {}) as { trigger_type?: string; created_by_name?: string };
  const triggerType = body.trigger_type === 'auto' ? 'auto' : 'manual';
  const createdByName =
    typeof body.created_by_name === 'string' && body.created_by_name.trim()
      ? body.created_by_name.trim().slice(0, 255)
      : '管理员';

  try {
    const result = await runDataBackup({ triggerType, createdByName });
    res.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Backup failed';
    res.status(500).json({ success: false, error: msg });
  }
}

export async function getBackupTableSnapshotController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { backupId, tableName } = req.params as { backupId: string; tableName: string };
  try {
    const rows = await readBackupTableJson(backupId, tableName);
    res.json(rows);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Read failed';
    if (msg === 'INVALID_PARAMS') {
      res.status(400).json({ success: false, error: msg });
      return;
    }
    res.status(404).json({ success: false, error: msg });
  }
}

export async function deleteBackupController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { backupId } = req.params as { backupId: string };
  try {
    await deleteBackupFilesAndRecord(backupId);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Delete failed';
    res.status(400).json({ success: false, error: msg });
  }
}
