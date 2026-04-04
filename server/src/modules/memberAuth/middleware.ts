/**
 * 会员端 Token 中间件
 * 登录后签发 member_token，后续接口通过此中间件校验身份
 */
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../../config/index.js';
import { verifyMemberAuthGateRepository } from './repository.js';
import { isMemberAuthInfoGet } from './memberMcpPath.js';

const MEMBER_JWT_SECRET = config.jwt.memberSecret;
const MEMBER_JWT_EXPIRES_IN = '7d';

export interface MemberTokenPayload {
  sub: string; // member_id
  phone: string;
  tenant_id?: string | null;
  type: 'member';
  /** 与 members.member_login_session_seq 对齐，新设备登录后旧 token 失效 */
  sid: number;
}

export interface MemberAuthenticatedRequest extends Request {
  member?: {
    id: string;
    phone: string;
    tenant_id?: string | null;
  };
}

export function signMemberToken(
  memberId: string,
  phone: string,
  tenantId: string | null | undefined,
  sessionSeq: number,
): string {
  const payload: MemberTokenPayload = {
    sub: memberId,
    phone,
    tenant_id: tenantId ?? null,
    type: 'member',
    sid: sessionSeq,
  };
  return jwt.sign(payload, MEMBER_JWT_SECRET, { expiresIn: MEMBER_JWT_EXPIRES_IN });
}

export async function memberAuthMiddleware(
  req: MemberAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Member token required' } });
    return;
  }

  try {
    const decoded = jwt.verify(token, MEMBER_JWT_SECRET, { algorithms: ['HS256'] }) as MemberTokenPayload;
    if (decoded.type !== 'member' || !decoded.sub) {
      res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid member token' } });
      return;
    }
    const gate = await verifyMemberAuthGateRepository(decoded.sub, decoded.sid);
    if (!gate.ok) {
      if (gate.reason === 'not_found') {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid member token' } });
        return;
      }
      res.status(401).json({
        success: false,
        error: {
          code: 'MEMBER_SESSION_REPLACED',
          message: 'Your account has been signed in on another device. If this was not you, please change your password promptly.',
        },
      });
      return;
    }
    if (gate.mustChangePassword && isMemberAuthInfoGet(req)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'MEMBER_MUST_CHANGE_PASSWORD',
          message: 'Please change your password first before continuing',
        },
      });
      return;
    }
    req.member = {
      id: decoded.sub,
      phone: decoded.phone,
      tenant_id: decoded.tenant_id,
    };
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Member token expired or invalid' },
    });
  }
}
