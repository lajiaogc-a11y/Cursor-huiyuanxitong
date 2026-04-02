/**
 * 无 JWT 的内部端点（密钥保护），挂载在 /api/internal
 */
import { Router } from 'express';
import { postInternalBackupRunController } from './internalController.js';
import { postInternalWebhookProcessQueueController } from '../webhooks/internalProcessController.js';

const router = Router();

router.post('/backup/run', postInternalBackupRunController);
router.post('/webhooks/process-queue', postInternalWebhookProcessQueueController);

export default router;
