import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';

export function requirePlatformSuperAdminMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user || req.user.type !== 'employee') {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated or session expired. Please sign in again.' } });
    return;
  }
  if (!req.user.is_platform_super_admin) {
    res.status(403).json({
      success: false,
      error: {
        code: 'PLATFORM_SUPER_ADMIN_REQUIRED',
        message: 'Platform super admin access required. Use a platform super admin account or sign in again to refresh permissions.',
      },
    });
    return;
  }
  next();
}
