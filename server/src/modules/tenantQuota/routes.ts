import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  checkQuotaController,
  getQuotaStatusController,
  listQuotasController,
  setQuotaController,
} from './controller.js';

const router = Router();

router.post('/check', authMiddleware, checkQuotaController);
router.post('/status', authMiddleware, getQuotaStatusController);
router.post('/list', authMiddleware, listQuotasController);
router.post('/set', authMiddleware, setQuotaController);

export default router;
