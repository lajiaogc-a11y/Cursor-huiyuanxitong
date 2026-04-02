/**
 * 仅允许「租户超级管理员」或「平台总管理员」下载完整 MySQL 转储（含全库所有租户数据）。
 * 普通 admin/manager 禁止，避免多租户环境下误导出全平台数据。
 */
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';

export function databaseDumpAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const u = req.user;
  if (!u || u.type !== 'employee') {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '需要员工登录' } });
    return;
  }
  const ok =
    u.is_platform_super_admin === true ||
    (u.role === 'admin' && u.is_super_admin === true);
  if (!ok) {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message:
          '需要「平台总管理员」或「租户管理员且 is_super_admin」才能导出完整数据库。请联系主管理员。',
      },
    });
    return;
  }
  next();
}
