/**
 * 会员邀请注册（公开）：先 register-init 换取一次性 token，再 register 完成开户。
 * 路径前缀：/api/member
 */
import { Router, type Request, type Response } from 'express';
import { validate, z } from '../../middlewares/validate.js';
import {
  memberRegisterInitLimiter,
  memberRegisterInitPerInviteLimiter,
  memberRegisterCompleteLimiter,
  dataRpcPostLimiter,
} from '../../middlewares/rateLimit.js';
import { initInviteRegisterToken, completeInviteRegister } from './service.js';

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

function statusForInitError(err: string): number {
  if (err === 'INVALID_CODE') return 404;
  if (err === 'INVITE_DISABLED') return 403;
  return 400;
}

function statusForRegisterError(err: string): number {
  const map: Record<string, number> = {
    INVALID_TOKEN: 401,
    TOKEN_USED: 410,
    TOKEN_EXPIRED: 401,
    SELF_REFERRAL: 400,
    ALREADY_INVITED: 409,
    INVALID_INPUT: 400,
    INVALID_REFERRER: 400,
    REGISTER_FAILED: 500,
  };
  return map[err] ?? 400;
}

router.post(
  '/register-init',
  dataRpcPostLimiter,
  validate({ body: initSchema }),
  memberRegisterInitPerInviteLimiter,
  memberRegisterInitLimiter,
  async (req: Request, res: Response) => {
    const { code } = req.body as { code: string };
    const r = await initInviteRegisterToken(code, {
      clientIp: req.ip,
      userAgent: req.get('user-agent') || null,
    });
    if (!r.success) {
      return res.status(statusForInitError(r.error)).json({
        success: false,
        error: { code: r.error, message: r.error },
      });
    }
    res.json({ success: true, registerToken: r.registerToken, expiresIn: r.expiresIn });
  },
);

router.post(
  '/register',
  memberRegisterCompleteLimiter,
  dataRpcPostLimiter,
  validate({ body: registerSchema }),
  async (req: Request, res: Response) => {
    const { registerToken, phone, password, name, captcha } = req.body as {
      registerToken: string;
      phone: string;
      password: string;
      name?: string | null;
      captcha?: string;
    };
    void captcha;
    const cr = await completeInviteRegister({
      registerToken,
      inviteePhone: phone,
      password,
      nickname: name,
      clientIp: req.ip,
      userAgent: req.get('user-agent') || null,
    });
    if (!cr.success) {
      return res.status(statusForRegisterError(cr.error)).json({
        success: false,
        error: { code: cr.error, message: cr.error },
      });
    }
    res.json({
      success: true,
      memberId: cr.member_id,
      member_code: cr.member_code,
    });
  },
);

export default router;
