/**
 * Points 路由
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import { validate, z } from '../../middlewares/validate.js';
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

/* ── shared param schemas ── */
const memberIdParam = z.object({ memberId: z.string().min(1, 'memberId required').max(100) });
const orderIdParam = z.object({ id: z.string().min(1, 'id required').max(100) });

/* ── POST /ledger ── */
const ledgerBody = z.object({
  transaction_type: z.enum(['consumption', 'referral_1', 'referral_2']),
  points_earned: z.number().finite(),
  order_id: z.string().max(100).nullable().optional(),
  member_code: z.string().max(50).nullable().optional(),
  phone_number: z.string().max(30).nullable().optional(),
  actual_payment: z.number().finite().nullable().optional(),
  currency: z.string().max(10).nullable().optional(),
  exchange_rate: z.number().finite().nullable().optional(),
  usd_amount: z.number().finite().nullable().optional(),
  points_multiplier: z.number().finite().nullable().optional(),
  status: z.string().max(20).optional(),
  creator_id: z.string().max(100).nullable().optional(),
}).passthrough();

/* ── POST /member-activity/add-consumption ── */
const addConsumptionBody = z.object({
  phone_number: z.string().min(1, 'phone_number required').max(30),
  consumption_points: z.number().finite().positive('consumption_points must be > 0'),
}).passthrough();

/* ── POST /member-activity/add-referral ── */
const addReferralBody = z.object({
  phone_number: z.string().min(1, 'phone_number required').max(30),
  referral_points: z.number().finite().positive('referral_points must be > 0'),
}).passthrough();

/* ── POST /reverse-on-order-cancel ── */
const reverseBody = z.object({
  order_id: z.string().min(1, 'order_id required').max(100),
}).passthrough();

/* ── POST /orders (create point order) ── */
const createPointOrderBody = z.object({
  member_id: z.string().min(1, 'member_id required').max(100),
  product_name: z.string().min(1, 'product_name required').max(200),
  product_id: z.string().max(100).optional(),
  quantity: z.number().int().min(1).optional(),
  points_cost: z.number().finite().positive('points_cost must be > 0'),
  client_request_id: z.string().max(100).optional(),
}).passthrough();

/* ── POST /orders/:id/reject ── */
const rejectBody = z.object({
  reason: z.string().max(500).optional(),
}).passthrough();

/* ── GET /orders (list) ── */
const listOrdersQuery = z.object({
  status: z.string().max(30).optional(),
  member_id: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
}).passthrough();

const router = Router();

router.get('/member/:memberId',           authMiddleware, validate({ params: memberIdParam }), getMemberPointsController);
router.get('/member/:memberId/breakdown',  authMiddleware, validate({ params: memberIdParam }), getMemberPointsBreakdownController);
router.get('/member/:memberId/spin-quota', authMiddleware, validate({ params: memberIdParam }), getMemberSpinQuotaController);
router.get('/member/:memberId/frozen',     authMiddleware, validate({ params: memberIdParam }), getMemberFrozenPointsController);

/** 下单发积分、活动同步（员工端 / 会员端 JWT 均可） */
router.post('/ledger',                              authMiddleware, validate({ body: ledgerBody }), postLedgerController);
router.post('/member-activity/add-consumption',     authMiddleware, validate({ body: addConsumptionBody }), postMemberActivityAddConsumptionController);
router.post('/member-activity/add-referral',        authMiddleware, validate({ body: addReferralBody }), postMemberActivityAddReferralController);
router.post('/reverse-on-order-cancel',             authMiddleware, validate({ body: reverseBody }), postReverseOnOrderCancelController);

/** 积分兑换订单（冻结→审核→确认/拒绝） */
router.post('/orders',              authMiddleware, validate({ body: createPointOrderBody }), createPointOrderController);
router.get('/orders',               authMiddleware, validate({ query: listOrdersQuery }), listPointOrdersController);
router.get('/orders/:id',           authMiddleware, validate({ params: orderIdParam }), getPointOrderController);
router.post('/orders/:id/approve',  authMiddleware, validate({ params: orderIdParam }), approvePointOrderController);
router.post('/orders/:id/reject',   authMiddleware, validate({ params: orderIdParam, body: rejectBody }), rejectPointOrderController);

export default router;
