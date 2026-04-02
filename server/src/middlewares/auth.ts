/**
 * JWT 认证中间件 - 验证请求头中的 Authorization: Bearer <token>
 * 同时支持员工 JWT 和会员 JWT（MySQL 迁移后统一认证）
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import {
  touchMemberLastSeenThrottledRepository,
  verifyMemberAuthGateRepository,
} from '../modules/memberAuth/repository.js';
import { isMemberMcpExemptGlobalRequest } from '../modules/memberAuth/memberMcpPath.js';
import { resolveAccessScope, type AccessScope } from '../security/accessScope.js';
import { assertEmployeeDeviceJwtAllowed } from '../modules/adminDeviceWhitelist/middlewareVerify.js';

export interface AuthenticatedRequest extends Request {
  /** 与 JWT 同步；未走 auth 的请求可能为空，可调用 resolveAccessScope(req) 兜底 */
  accessScope?: AccessScope;
  user?: {
    id: string;
    email?: string;
    tenant_id?: string;
    role?: string;
    username?: string;
    real_name?: string;
    status?: string;
    is_super_admin?: boolean;
    is_platform_super_admin?: boolean;
    token?: string;
    /** 如果是会员 JWT，type = 'member' */
    type?: 'member' | 'employee';
    phone?: string;
    /** 员工 JWT 在设备白名单启用时携带，与库中白名单核对 */
    device_id?: string;
  };
}

function tryVerify(token: string, secret: string): any | null {
  try {
    return jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '缺少或无效的登录凭证，请重新登录' } });
    return;
  }

  const token = authHeader.slice(7);

  // 1. 先尝试员工 JWT
  const empPayload = tryVerify(token, config.jwt.secret);
  if (empPayload && empPayload.sub) {
    const tokenDeviceId =
      typeof empPayload.device_id === 'string' && empPayload.device_id ? empPayload.device_id : undefined;
    req.user = {
      id: empPayload.sub,
      email: empPayload.email,
      tenant_id: empPayload.tenant_id,
      role: empPayload.role,
      username: empPayload.username,
      real_name: empPayload.real_name,
      status: empPayload.status,
      is_super_admin: empPayload.is_super_admin,
      is_platform_super_admin: empPayload.is_platform_super_admin,
      token,
      type: 'employee',
      device_id: tokenDeviceId,
    };
    req.accessScope = resolveAccessScope(req);
    /** 平台设备白名单配置仅平台超管可访问（见 requirePlatformSuperAdminMiddleware），此处跳过 JWT 内 device_id 校验，避免白名单开启后无法进入配置页、以及部分环境下校验链路异常导致 500 */
    const skipStaffDeviceCheck =
      req.baseUrl === '/api/platform/device-whitelist' ||
      (req.baseUrl === '/api/auth' &&
        ((req.path === '/me' && req.method === 'GET') ||
          (req.path === '/devices/bind' && req.method === 'POST') ||
          (req.path === '/devices/me' && req.method === 'GET')));
    if (!skipStaffDeviceCheck) {
      const deviceGate = await assertEmployeeDeviceJwtAllowed(req, tokenDeviceId);
      if (!deviceGate.ok) {
        res.status(deviceGate.status).json(deviceGate.json);
        return;
      }
    }
    next();
    return;
  }

  // 2. 再尝试会员 JWT（独立密钥 MEMBER_JWT_SECRET，与员工 JWT_SECRET 隔离）
  const memberPayload = tryVerify(token, config.jwt.memberSecret);
  if (memberPayload && memberPayload.sub) {
    const gate = await verifyMemberAuthGateRepository(memberPayload.sub, memberPayload.sid);
    if (!gate.ok) {
      if (gate.reason === 'not_found') {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '登录已失效，请重新登录' } });
        return;
      }
      res.status(401).json({
        success: false,
        error: {
          code: 'MEMBER_SESSION_REPLACED',
          message: '您的账号已在其他设备登录，如非本人操作请及时修改密码。',
        },
      });
      return;
    }
    req.user = {
      id: memberPayload.sub,
      tenant_id: memberPayload.tenant_id ?? undefined,
      role: 'member',
      token,
      type: 'member',
      phone: memberPayload.phone,
    };
    req.accessScope = resolveAccessScope(req);
    if (gate.mustChangePassword && !isMemberMcpExemptGlobalRequest(req as AuthenticatedRequest)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'MEMBER_MUST_CHANGE_PASSWORD',
          message: '请先修改登录密码后再继续使用',
        },
      });
      return;
    }
    void touchMemberLastSeenThrottledRepository(memberPayload.sub).catch(() => { /* fire-and-forget; login must not block on last_seen */ });
    next();
    return;
  }

  res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '登录已失效，请重新登录' } });
}

/** 仅允许会员 JWT（员工 JWT 的 sub 为员工 id，不能用于抽奖等业务身份） */
export function requireMemberJwt(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.user?.type !== 'member') {
    res.status(403).json({
      success: false,
      error: {
        code: 'MEMBER_JWT_REQUIRED',
        message: '此操作需要会员登录状态',
      },
    });
    return;
  }
  next();
}
