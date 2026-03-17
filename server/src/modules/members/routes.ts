/**
 * Members 路由
 * 注意：/referrals 必须在 /:id 之前，否则 "referrals" 会被当作 id
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  listMembersController,
  getMemberByIdController,
  createMemberController,
  updateMemberController,
  updateMemberByPhoneController,
  deleteMemberController,
  listReferralsController,
  getCustomerDetailByPhoneController,
  bulkCreateMembersController,
} from './controller.js';

const router = Router();

router.get('/', authMiddleware, listMembersController);
router.get('/referrals', authMiddleware, listReferralsController);
router.get('/customer-detail/:phone', authMiddleware, getCustomerDetailByPhoneController);
router.get('/:id', authMiddleware, getMemberByIdController);
router.post('/', authMiddleware, createMemberController);
router.post('/bulk', authMiddleware, bulkCreateMembersController);
router.put('/:id', authMiddleware, updateMemberController);
router.put('/by-phone/:phone', authMiddleware, updateMemberByPhoneController);
router.delete('/:id', authMiddleware, deleteMemberController);

export default router;
