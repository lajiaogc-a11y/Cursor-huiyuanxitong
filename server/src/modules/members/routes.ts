/**
 * Members 路由
 * 注意：/referrals 必须在 /:id 之前，否则 "referrals" 会被当作 id
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import { validate, z } from '../../middlewares/validate.js';
import {
  listMembersController,
  getMemberByIdController,
  createMemberController,
  updateMemberController,
  updateMemberByPhoneController,
  deleteMemberController,
  listReferralsController,
  getCustomerDetailByPhoneController,
  getReferrerByPhoneController,
  lookupMemberForReferralController,
  bulkCreateMembersController,
  adminResetMemberPasswordController,
  getInitialPasswordController,
} from './controller.js';

/* ── shared param / query fragments ── */
const idParam = z.object({ id: z.string().min(1, 'id required').max(100) });
const phoneParam = z.object({ phone: z.string().min(1, 'phone required').max(50) });
const optionalTenantQuery = z.object({ tenant_id: z.string().uuid().optional() }).passthrough();

/* ── POST / (create) ── */
const createMemberSchema = z.object({
  phone_number: z.string().min(5, 'phone_number too short').max(30),
  member_code: z.string().max(50).optional(),
  member_level: z.string().max(128).optional(),
  tenant_id: z.string().uuid().optional().nullable(),
}).passthrough();

/* ── GET / (list) ── */
const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).optional(),
  limit: z.coerce.number().int().min(1).max(100000).optional(),
  tenant_id: z.string().uuid().optional(),
}).passthrough();

/* ── PUT /:id, PUT /by-phone/:phone (update) ── */
const updateMemberBody = z.object({
  member_code: z.string().max(50).optional(),
  current_level_id: z.string().max(100).nullable().optional(),
  member_level: z.string().max(128).optional(),
  currency_preferences: z.array(z.unknown()).optional(),
  bank_card: z.unknown().optional(),
  common_cards: z.array(z.unknown()).optional(),
  customer_feature: z.string().max(2000).nullable().optional(),
  remark: z.string().max(10000).nullable().optional(),
  source_id: z.string().max(100).nullable().optional(),
  nickname: z.string().max(200).nullable().optional(),
  referrer_phone: z.string().max(50).nullable().optional(),
  tenant_id: z.string().uuid().optional().nullable(),
}).passthrough();

/* ── POST /:id/reset-password ── */
const resetPasswordBody = z.object({
  new_password: z.string().min(1, 'new_password required'),
}).passthrough();

/* ── POST /bulk ── */
const bulkMemberItem = z.object({
  phone_number: z.string().min(1).max(30),
  member_code: z.string().max(50).optional(),
  nickname: z.string().max(200).nullable().optional(),
  member_level: z.string().max(128).optional(),
  currency_preferences: z.array(z.unknown()).optional(),
  bank_card: z.unknown().optional(),
  common_cards: z.array(z.unknown()).optional(),
  customer_feature: z.string().max(2000).nullable().optional(),
  remark: z.string().max(10000).nullable().optional(),
  source_id: z.string().max(100).nullable().optional(),
  creator_id: z.string().max(100).nullable().optional(),
  tenant_id: z.string().uuid().optional(),
}).passthrough();

const bulkCreateBody = z.object({
  members: z.array(bulkMemberItem).min(1, 'members array required'),
  tenant_id: z.string().uuid().optional().nullable(),
}).passthrough();

/* ── GET /lookup ── */
const lookupQuery = z.object({
  q: z.string().min(1, 'q required').max(64),
  tenant_id: z.string().uuid().optional(),
}).passthrough();

/* ── GET /customer-detail/:phone ── */
const customerDetailQuery = z.object({
  tenant_id: z.string().uuid().optional(),
  sync_common_cards: z.string().optional(),
}).passthrough();

const router = Router();

router.get('/',                       authMiddleware, validate({ query: listQuery }), listMembersController);
router.get('/referrals',              authMiddleware, validate({ query: optionalTenantQuery }), listReferralsController);
router.get('/referrer-by-phone/:phone', authMiddleware, validate({ params: phoneParam, query: optionalTenantQuery }), getReferrerByPhoneController);
router.get('/customer-detail/:phone', authMiddleware, validate({ params: phoneParam, query: customerDetailQuery }), getCustomerDetailByPhoneController);
router.get('/lookup',                 authMiddleware, validate({ query: lookupQuery }), lookupMemberForReferralController);
router.get('/:id',                    authMiddleware, validate({ params: idParam, query: optionalTenantQuery }), getMemberByIdController);
router.post('/',                      authMiddleware, validate({ body: createMemberSchema }), createMemberController);
router.post('/bulk',                  authMiddleware, validate({ body: bulkCreateBody }), bulkCreateMembersController);
router.put('/:id',                    authMiddleware, validate({ params: idParam, body: updateMemberBody }), updateMemberController);
router.put('/by-phone/:phone',        authMiddleware, validate({ params: phoneParam, body: updateMemberBody }), updateMemberByPhoneController);
router.post('/:id/reset-password',    authMiddleware, validate({ params: idParam, body: resetPasswordBody }), adminResetMemberPasswordController);
router.get('/:id/initial-password',   authMiddleware, validate({ params: idParam }), getInitialPasswordController);
router.delete('/:id',                 authMiddleware, validate({ params: idParam, query: optionalTenantQuery }), deleteMemberController);

export default router;
