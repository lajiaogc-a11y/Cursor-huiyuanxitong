import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';

export function requirePlatformSuperAdminMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user || req.user.type !== 'employee') {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '未登录或登录已失效，请重新登录' } });
    return;
  }
  if (!req.user.is_platform_super_admin) {
    res.status(403).json({
      success: false,
      error: {
        code: 'PLATFORM_SUPER_ADMIN_REQUIRED',
        message: '仅平台超级管理员可操作；请使用平台总管理员账号或重新登录以刷新权限。',
      },
    });
    return;
  }
  next();
}
