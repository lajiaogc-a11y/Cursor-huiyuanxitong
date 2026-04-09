/**
 * 会员邀请注册（公开）：先 register-init 换取一次性 token，再 register 完成开户。
 * 路径前缀：/api/member
 */
import { Router } from 'express';
import { validate, z } from '../../middlewares/validate.js';
import {
  memberRegisterInitLimiter,
  memberRegisterInitPerInviteLimiter,
  memberRegisterCompleteLimiter,
  dataRpcPostLimiter,
} from '../../middlewares/rateLimit.js';
import { registerInitController, registerCompleteController } from './controller.js';

const router = Router();

const initSchema = z.object({
  code: z.string().min(1, 'code required').max(96),
});

const registerSchema = z.object({
  registerToken: z.string().min(32).max(128),
  phone: z.string().min(5).max(30),
  password: z.string().min(6).max(200),
  captcha: z.string().max(200).optional(),
  name: z.string().max(255).optional().nullable(),
});

router.post(
  '/register-init',
  dataRpcPostLimiter,
  validate({ body: initSchema }),
  memberRegisterInitPerInviteLimiter,
  memberRegisterInitLimiter,
  (req, res) => registerInitController(req, res),
);

router.post(
  '/register',
  memberRegisterCompleteLimiter,
  dataRpcPostLimiter,
  validate({ body: registerSchema }),
  (req, res) => registerCompleteController(req, res),
);

export default router;
