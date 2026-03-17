/**
 * Member Auth 路由 - 会员端认证（无需 JWT，使用 member_id）
 */
import { Router } from 'express';
import {
  memberSignInController,
  memberSetPasswordController,
  memberGetInfoController,
} from './controller.js';

const router = Router();

router.post('/signin', memberSignInController);
router.post('/set-password', memberSetPasswordController);
router.get('/info', memberGetInfoController);
router.post('/info', memberGetInfoController);

export default router;
