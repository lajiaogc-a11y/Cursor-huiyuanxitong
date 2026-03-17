/**
 * JWT 认证中间件 - 验证请求头中的 Authorization: Bearer <token>
 * 使用 jsonwebtoken 验证，替代 Supabase Auth
 *
 * 账号区分：平台总管理 JWT 中 tenant_id 为 undefined/null；租户账号为业务租户 ID
 */
import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../modules/auth/jwt.js';

export interface AuthenticatedRequest extends Request {
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
  };
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  console.log('[DEBUG auth] Authorization header:', authHeader ? `${authHeader.slice(0, 20)}...` : 'MISSING');

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token' } });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    console.log('[DEBUG auth] JWT verify failed, token prefix:', token.slice(0, 20));
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
    return;
  }

  req.user = {
    id: payload.sub,
    email: payload.email,
    tenant_id: payload.tenant_id,
    role: payload.role,
    username: payload.username,
    real_name: payload.real_name,
    status: payload.status,
    is_super_admin: payload.is_super_admin,
    is_platform_super_admin: payload.is_platform_super_admin,
    token,
  };
  console.log('[DEBUG auth] req.user:', JSON.stringify({ id: req.user.id, tenant_id: req.user.tenant_id, username: req.user.username, role: req.user.role }));
  next();
}
