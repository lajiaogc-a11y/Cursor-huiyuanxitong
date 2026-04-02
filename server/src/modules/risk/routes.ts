import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  recordRiskEventController,
  recalculateRiskScoreController,
  getAllRiskScoresController,
  getRecentRiskEventsController,
  resolveRiskEventController,
  checkLoginAnomalyController,
  checkFrequencyAnomalyController,
} from './controller.js';

const router = Router();

router.post('/events', authMiddleware, recordRiskEventController);
router.post('/events/resolve', authMiddleware, resolveRiskEventController);
router.get('/events', authMiddleware, getRecentRiskEventsController);
router.post('/recalculate', authMiddleware, recalculateRiskScoreController);
router.get('/scores', authMiddleware, getAllRiskScoresController);
router.post('/check-login-anomaly', authMiddleware, checkLoginAnomalyController);
router.post('/check-frequency-anomaly', authMiddleware, checkFrequencyAnomalyController);

export default router;
