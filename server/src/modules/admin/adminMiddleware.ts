/**
 * Admin 中间件 - 仅允许 role = admin 访问
 */
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';

export function adminMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    return;
  }
  const isAdmin = req.user.role === 'admin' || !!req.user.is_super_admin || !!req.user.is_platform_super_admin;
  if (!isAdmin) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin role required' } });
    return;
  }
  next();
}
