/**
 * 管理端数据备份：本地 JSON 文件 + data_backups 行
 * 挂载在 /api/admin/backup（父级已 auth + adminMiddleware）
 */
import { Router } from 'express';
import {
  postRunBackupController,
  getBackupTableSnapshotController,
  deleteBackupController,
} from './controller.js';

const router = Router();

router.post('/run', postRunBackupController);
router.get('/:backupId/table/:tableName', getBackupTableSnapshotController);
router.delete('/:backupId', deleteBackupController);

export default router;
