/**
 * Auth 路由
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import { validate, z } from '../../middlewares/validate.js';
import { staffLoginLimiter, staffRegisterLimiter } from '../../middlewares/rateLimit.js';
import {
  loginController,
  registerController,
  logoutController,
  meController,
  syncPasswordController,
  verifyPasswordController,
  refreshController,
} from './controller.js';
import {
  getDeviceWhitelistPublicController,
  postBindDeviceController,
  listMyDevicesController,
} from '../adminDeviceWhitelist/controller.js';

const loginSchema = z.object({
  username: z.string().min(1, 'username required').max(100),
  password: z.string().min(1, 'password required').max(200),
  device_id: z.string().max(128).optional(),
});

const registerSchema = z.object({
  username: z.string().min(2, 'username too short').max(50),
  password: z.string().min(6, 'password must be at least 6 characters').max(200),
  realName: z.string().min(1, 'realName required').max(100),
  invitationCode: z.string().optional(),
});

const syncPasswordSchema = z.object({
  username: z.string().min(1, 'username required').max(100),
  password: z.string().min(1, 'password required').max(200),
});

const verifyPasswordSchema = z.object({
  password: z.string().min(1, 'password required').max(200),
});

const router = Router();

router.get('/device-whitelist/status', getDeviceWhitelistPublicController);

// 无需鉴权：返回客户端 IP（供登录时设备指纹使用）
router.get('/client-ip', (_req, res) => {
  res.json({ ip: _req.ip || _req.socket.remoteAddress || null });
});

const bindDeviceSchema = z.object({
  device_id: z.string().min(8).max(128),
  device_name: z.string().max(255).optional(),
});

router.post('/login', staffLoginLimiter, validate({ body: loginSchema }), loginController);
router.post('/register', staffRegisterLimiter, validate({ body: registerSchema }), registerController);
router.post('/refresh', staffLoginLimiter, validate({ body: z.object({ token: z.string().min(1) }) }), refreshController);
router.post('/logout', logoutController);
router.get('/me', authMiddleware, meController);
router.post('/devices/bind', authMiddleware, validate({ body: bindDeviceSchema }), postBindDeviceController);
router.get('/devices/me', authMiddleware, listMyDevicesController);
router.post('/sync-password', authMiddleware, validate({ body: syncPasswordSchema }), syncPasswordController);
router.post(
  '/verify-password',
  authMiddleware,
  validate({ body: verifyPasswordSchema }),
  verifyPasswordController,
);

export default router;
