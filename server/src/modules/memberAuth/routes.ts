/**
 * Member Auth 路由 - 会员端认证
 * /signin 无需 token（登录接口）
 * /info 和 /set-password 需要 member token
 */
import { Router } from 'express';
import {
  memberSignInController,
  memberSetPasswordController,
  memberGetInfoController,
} from './controller.js';
import { memberAuthMiddleware } from './middleware.js';
import { validate, z } from '../../middlewares/validate.js';
import { memberSignInLimiter } from '../../middlewares/rateLimit.js';

const signInSchema = z.object({
  phone: z.string().min(5, 'phone too short').max(30),
  password: z.string().min(1, 'password required').max(200),
});

const setPasswordSchema = z.object({
  old_password: z.string().max(200).optional().nullable(),
  new_password: z.string().min(6, 'password must be at least 6 characters').max(200),
});

const router = Router();

router.post('/signin', memberSignInLimiter, validate({ body: signInSchema }), memberSignInController);
router.get('/signin', (_req, res) => {
  res.status(405).json({ success: false, code: 'METHOD_NOT_ALLOWED', message: 'Use POST to sign in' });
});
router.post('/set-password', memberAuthMiddleware, validate({ body: setPasswordSchema }), memberSetPasswordController);
router.get('/info', memberAuthMiddleware, memberGetInfoController);
router.post('/info', memberAuthMiddleware, memberGetInfoController);

export default router;
