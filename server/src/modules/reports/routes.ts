/**
 * Reports 路由
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  getDashboardController,
  getDashboardTrendController,
  getOrdersReportController,
  getActivityGiftsReportController,
  getBaseDataController,
} from './controller.js';

const router = Router();

router.get('/dashboard', authMiddleware, getDashboardController);
router.get('/dashboard-trend', authMiddleware, getDashboardTrendController);
router.get('/orders', authMiddleware, getOrdersReportController);
router.get('/activity-gifts', authMiddleware, getActivityGiftsReportController);
router.get('/base-data', authMiddleware, getBaseDataController);

export default router;
