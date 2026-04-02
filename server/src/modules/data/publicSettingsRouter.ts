/**
 * 登录前可读的 data 设置（必须在主 data Router 之前挂载，避免被 router.use(authMiddleware) 吞掉）
 */
import { Router } from 'express';
import { getIpAccessControlController, getIpCountryCheckController } from './controller.js';

const router = Router();
router.get('/ip-access-control', getIpAccessControlController);
router.get('/ip-country-check', getIpCountryCheckController);

export default router;
