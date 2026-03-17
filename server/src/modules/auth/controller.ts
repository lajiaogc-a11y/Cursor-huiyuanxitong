/**
 * Auth Controller - 接收请求、调用 Service、返回结果
 */
import type { Request, Response } from 'express';
import { loginService, registerService, getMeService } from './service.js';
import type { LoginRequest, RegisterRequest } from './types.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';

export async function loginController(req: Request, res: Response): Promise<void> {
  const body = req.body as LoginRequest;
  if (!body.username || !body.password) {
    res.status(400).json({ success: false, error: '用户名和密码不能为空' });
    return;
  }
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || (req.headers['x-real-ip'] as string)
    || req.socket?.remoteAddress;
  const userAgent = req.headers['user-agent'] ?? '';

  try {
    const result = await loginService(body, clientIp, userAgent);
    if (!result.success) {
      console.log('[Auth] Login failed:', body.username, result.error);
      res.status(401).json({ success: false, error: result.error });
      return;
    }
    res.json({
      success: true,
      token: result.token,
      user: result.user,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Auth] Login error:', body.username, err);
    res.status(500).json({
      success: false,
      error: msg || '登录服务异常，请检查 server/.env 是否配置 SUPABASE_SERVICE_ROLE_KEY 和 SUPABASE_URL',
    });
  }
}

export async function registerController(req: Request, res: Response): Promise<void> {
  const body = req.body as RegisterRequest;
  if (!body.username || !body.password || !body.realName) {
    res.status(400).json({ success: false, error: '用户名、密码和真实姓名不能为空' });
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
    message: result.assigned_status === 'active' ? '注册成功，请登录' : '注册成功，等待管理员审批',
  });
}

export async function logoutController(_req: Request, res: Response): Promise<void> {
  // 客户端清除 token 即可，服务端无状态
  res.json({ success: true, message: '已退出登录' });
}

export async function meController(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const u = authReq.user;
  if (!u?.id) {
    res.status(401).json({ success: false, error: '未登录' });
    return;
  }
  let user = await getMeService(u.id);
  if (!user && u.username && u.real_name !== undefined) {
    // DB 查询失败时，从 JWT 回退。平台总管理 tenant_id 强制为 null
    const tenantId = u.is_platform_super_admin ? null : (u.tenant_id ?? null);
    user = {
      id: u.id,
      username: u.username,
      real_name: u.real_name ?? u.username,
      role: u.role ?? 'staff',
      status: u.status ?? 'active',
      is_super_admin: u.is_super_admin ?? false,
      is_platform_super_admin: u.is_platform_super_admin ?? false,
      tenant_id: tenantId,
    };
  }
  if (!user) {
    res.status(401).json({ success: false, error: '用户不存在或已禁用' });
    return;
  }
  res.json({ success: true, user });
}
