import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../../middlewares/auth.js';
import { requirePlatformSuperAdminMiddleware } from './platformMiddleware.js';
import {
  getDeviceWhitelistConfigController,
  putDeviceWhitelistConfigController,
  listDevicesAdminController,
  postDeviceAdminController,
  deleteDeviceAdminController,
} from './controller.js';

const router = Router();

/** Express 4：确保 async auth 的 rejection 进入 error handler，避免未捕获 Promise 导致 500 */
router.use((req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(authMiddleware(req as AuthenticatedRequest, res, next)).catch(next);
});
router.use(requirePlatformSuperAdminMiddleware);

router.get('/config', getDeviceWhitelistConfigController);
router.put('/config', putDeviceWhitelistConfigController);
router.get('/devices', listDevicesAdminController);
router.post('/devices', postDeviceAdminController);
router.delete('/devices/:id', deleteDeviceAdminController);

export default router;
