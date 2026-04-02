/**
 * Points 路由
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  getMemberPointsController,
  getMemberPointsBreakdownController,
  getMemberSpinQuotaController,
  postLedgerController,
  postMemberActivityAddConsumptionController,
  postMemberActivityAddReferralController,
  postReverseOnOrderCancelController,
} from './controller.js';
import {
  createPointOrderController,
  approvePointOrderController,
  rejectPointOrderController,
  listPointOrdersController,
  getPointOrderController,
  getMemberFrozenPointsController,
} from './pointOrderController.js';

const router = Router();

router.get('/member/:memberId', authMiddleware, getMemberPointsController);
router.get('/member/:memberId/breakdown', authMiddleware, getMemberPointsBreakdownController);
router.get('/member/:memberId/spin-quota', authMiddleware, getMemberSpinQuotaController);
router.get('/member/:memberId/frozen', authMiddleware, getMemberFrozenPointsController);

/** 下单发积分、活动同步（员工端 / 会员端 JWT 均可） */
router.post('/ledger', authMiddleware, postLedgerController);
router.post('/member-activity/add-consumption', authMiddleware, postMemberActivityAddConsumptionController);
router.post('/member-activity/add-referral', authMiddleware, postMemberActivityAddReferralController);
router.post('/reverse-on-order-cancel', authMiddleware, postReverseOnOrderCancelController);

/** 积分兑换订单（冻结→审核→确认/拒绝） */
router.post('/orders', authMiddleware, createPointOrderController);
router.get('/orders', authMiddleware, listPointOrdersController);
router.get('/orders/:id', authMiddleware, getPointOrderController);
router.post('/orders/:id/approve', authMiddleware, approvePointOrderController);
router.post('/orders/:id/reject', authMiddleware, rejectPointOrderController);

export default router;
