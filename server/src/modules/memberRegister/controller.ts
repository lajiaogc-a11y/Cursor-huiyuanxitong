/**
 * MemberRegister Controller — 邀请注册 HTTP 层
 */
import type { Request, Response } from 'express';
import { initInviteRegisterToken, completeInviteRegister } from './service.js';

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
    PHONE_ALREADY_REGISTERED: 409,
    INVALID_INPUT: 400,
    INVALID_REFERRER: 400,
    REGISTER_FAILED: 500,
  };
  return map[err] ?? 400;
}

export async function registerInitController(req: Request, res: Response): Promise<void> {
  const { code } = req.body as { code: string };
  const r = await initInviteRegisterToken(code, {
    clientIp: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  if (!r.success) {
    res.status(statusForInitError(r.error)).json({
      success: false,
      error: { code: r.error, message: r.error },
    });
    return;
  }
  res.json({ success: true, registerToken: r.registerToken, expiresIn: r.expiresIn });
}

export async function registerCompleteController(req: Request, res: Response): Promise<void> {
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
    res.status(statusForRegisterError(cr.error)).json({
      success: false,
      error: { code: cr.error, message: cr.error },
    });
    return;
  }
  res.json({
    success: true,
    memberId: cr.member_id,
    member_code: cr.member_code,
  });
}
