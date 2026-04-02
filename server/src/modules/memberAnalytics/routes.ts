/**
 * 会员门户 — 网站数据与数据管理
 *
 * 路由前缀由 app.ts 挂载决定（/api/member-portal/site-data）。
 * 历史路径 /api/member-portal/analytics 因包含 "analytics" 关键词
 * 被主流广告拦截器/隐私插件阻断（EasyPrivacy 规则），导致请求无法到达后端。
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  getWebsiteStatsController,
  getDataCleanupSettingsController,
  putDataCleanupSettingsController,
  getCleanupPreviewController,
  postRunCleanupController,
} from './controller.js';

const router = Router();

router.get('/stats', authMiddleware, getWebsiteStatsController);
router.get('/data-cleanup', authMiddleware, getDataCleanupSettingsController);
router.put('/data-cleanup', authMiddleware, putDataCleanupSettingsController);
router.get('/data-cleanup/preview', authMiddleware, getCleanupPreviewController);
router.post('/data-cleanup/run', authMiddleware, postRunCleanupController);

export default router;
