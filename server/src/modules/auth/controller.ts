/**
 * Auth Controller - 接收请求、调用 Service、返回结果
 */
import type { Request, Response } from 'express';
import {
  loginService,
  registerService,
  getMeService,
  refreshTokenService,
  syncAuthPasswordService,
  verifyAuthPasswordService,
} from './service.js';
import type { AuthUser, LoginRequest, RegisterRequest } from './types.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { config } from '../../config/index.js';
import { getRequestClientIp } from '../../lib/requestClientIp.js';

export async function loginController(req: Request, res: Response): Promise<void> {
  const body = req.body as LoginRequest;
  if (!body.username || !body.password) {
    res.status(400).json({ success: false, error: 'Username and password are required' });
    return;
  }
  const clientIp = getRequestClientIp(req);
  const userAgent = req.headers['user-agent'] ?? '';

  try {
    const result = await loginService(body, clientIp, userAgent);
    if (!result.success) {
      console.log('[Auth] Login failed:', body.username, result.error);
      if (result.httpStatus === 503) {
        res.status(503).json({
          success: false,
          code: 'SERVICE_UNAVAILABLE',
          message: result.error || 'Service temporarily unavailable. Please try again later.',
        });
        return;
      }
      const msg = result.error || 'Login failed';
      const deviceDenied = msg.startsWith('DEVICE_NOT_AUTHORIZED:');
      if (deviceDenied) {
        res.status(403).json({
          success: false,
          code: 'DEVICE_NOT_AUTHORIZED',
          message: msg.replace(/^DEVICE_NOT_AUTHORIZED:\s*/, ''),
        });
        return;
      }
      res.status(401).json({ success: false, error: msg });
      return;
    }
    res.json({
      success: true,
      token: result.token,
      user: result.user,
    });
  } catch (err: unknown) {
    console.error('[Auth] Login error:', body.username, err);
    res.status(500).json({
      success: false,
      error: 'Login service error. Please try again later.',
    });
  }
}

export async function registerController(req: Request, res: Response): Promise<void> {
  const body = req.body as RegisterRequest;
  if (!body.username || !body.password || !body.realName) {
    res.status(400).json({ success: false, error: 'Username, password, and real name are required' });
    return;
  }
  const result = await registerService({
    username: body.username,
    password: body.password,
    realName: body.realName,
    invitationCode: body.invitationCode,
  });
  if (!result.success) {
    res.status(400).json({
      success: false,
      error_code: result.error_code,
      message: result.message,
    });
    return;
  }
  res.json({
    success: true,
    assigned_status: result.assigned_status,
    message: result.assigned_status === 'active' ? 'Registration successful. Please sign in.' : 'Registration successful. Pending administrator approval.',
  });
}

export async function logoutController(_req: Request, res: Response): Promise<void> {
  // 客户端清除 token 即可，服务端无状态
  res.json({ success: true, message: 'Signed out' });
}

/** 当前登录员工将 MySQL employees.password_hash 更新为给定密码（bcrypt） */
export async function syncPasswordController(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const u = authReq.user;
  const body = req.body as { username?: string; password?: string };
  const username = String(body?.username || '').trim();
  const password = body?.password;

  if (!username || !password) {
    res.status(400).json({ success: false, message: 'Username and password are required' });
    return;
  }
  if (u?.type !== 'employee' || !u.username) {
    res.status(403).json({ success: false, message: 'Only staff can sync passwords' });
    return;
  }
  if (u.username !== username) {
    res.status(403).json({ success: false, message: 'You may only sync the password for your current account' });
    return;
  }

  const r = await syncAuthPasswordService(username, password);
  if (!r.success) {
    res.status(400).json({ success: false, message: r.message || 'Sync failed' });
    return;
  }
  res.json({ success: true });
}

/**
 * 校验当前登录员工的密码（与登录一致 bcrypt/SHA256 兼容），用于商家结算撤回等敏感操作。
 * 任意已登录员工均可调用；与 /api/admin/verify-password（仅 admin 路由可访问）不同。
 */
export async function verifyPasswordController(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const password = String((req.body as { password?: string })?.password ?? '');
  if (!password) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Password required' } });
    return;
  }
  const username = authReq.user?.username;
  if (!username || authReq.user?.type !== 'employee') {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    return;
  }
  try {
    const valid = await verifyAuthPasswordService(username, password);
    res.json({ success: true, valid });
  } catch (e) {
    console.error('[Auth] verify-password error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Verification failed' } });
  }
}

function normalizeAuthUserPayload(user: Partial<AuthUser> & { id?: string }): AuthUser {
  return {
    id: String(user.id ?? ''),
    username: String(user.username ?? ''),
    real_name: String(user.real_name ?? user.username ?? ''),
    role: String(user.role ?? 'staff'),
    status: String(user.status ?? 'active'),
    is_super_admin: !!user.is_super_admin,
    is_platform_super_admin: !!user.is_platform_super_admin,
    tenant_id:
      user.tenant_id === undefined || user.tenant_id === null || user.tenant_id === ''
        ? null
        : String(user.tenant_id),
  };
}

export async function meController(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const u = authReq.user;
    if (!u?.id) {
      res.status(401).json({ success: false, error: 'Not signed in' });
      return;
    }
    let user = await getMeService(u.id);
    if (!user && u.username) {
      user = normalizeAuthUserPayload({
        id: u.id,
        username: u.username,
        real_name: u.real_name,
        role: u.role,
        status: u.status,
        is_super_admin: u.is_super_admin,
        is_platform_super_admin: u.is_platform_super_admin,
        tenant_id: u.tenant_id ?? null,
      });
    }
    if (!user || !user.id) {
      res.status(401).json({ success: false, error: 'User not found or disabled' });
      return;
    }
    const payload: Record<string, unknown> = { success: true, user: normalizeAuthUserPayload(user) };
    if (user.is_platform_super_admin) {
      payload.platform_tenant_id = config.platformTenantId;
    }
    res.json(payload);
  } catch (e) {
    console.error('[Auth] /me error:', e);
    res.status(500).json({ success: false, error: { code: 'ME_FAILED', message: 'Failed to get user info' } });
  }
}

/**
 * POST /api/auth/refresh — 用旧 token 换新 token
 * Body: { token: string }
 */
export async function refreshController(req: Request, res: Response): Promise<void> {
  const { token } = req.body as { token?: string };
  if (!token) {
    res.status(400).json({ success: false, error: 'token required' });
    return;
  }
  try {
    const result = await refreshTokenService(token);
    if (!result.success) {
      res.status(401).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, token: result.token, user: result.user });
  } catch (e) {
    console.error('[Auth] refresh error:', e);
    res.status(500).json({ success: false, error: 'REFRESH_FAILED' });
  }
}
