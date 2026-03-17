/**
 * Points 路由
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  getMemberPointsController,
  getMemberPointsBreakdownController,
  getMemberSpinQuotaController,
} from './controller.js';

const router = Router();

router.get('/member/:memberId', authMiddleware, getMemberPointsController);
router.get('/member/:memberId/breakdown', authMiddleware, getMemberPointsBreakdownController);
router.get('/member/:memberId/spin-quota', authMiddleware, getMemberSpinQuotaController);

export default router;
