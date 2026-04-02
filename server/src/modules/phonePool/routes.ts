/**
 * 号码池 API 路由
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  extractPhonesController,
  returnPhonesController,
  consumePhonesController,
  getPhoneStatsController,
  getMyReservedPhonesController,
  bulkImportController,
  clearPhonePoolController,
  getExtractSettingsController,
  getExtractRecordsController,
  updateExtractSettingsController,
  phonePoolHealthController,
} from './controller.js';

const router = Router();

router.post('/extract', authMiddleware, extractPhonesController);
router.post('/return', authMiddleware, returnPhonesController);
router.post('/consume', authMiddleware, consumePhonesController);
router.get('/stats', authMiddleware, getPhoneStatsController);
router.get('/my-reserved', authMiddleware, getMyReservedPhonesController);
router.post('/bulk-import', authMiddleware, bulkImportController);
router.post('/clear', authMiddleware, clearPhonePoolController);
router.get('/settings', authMiddleware, getExtractSettingsController);
router.get('/records', authMiddleware, getExtractRecordsController);
router.put('/settings', authMiddleware, updateExtractSettingsController);
router.get('/health', authMiddleware, phonePoolHealthController);

export default router;
