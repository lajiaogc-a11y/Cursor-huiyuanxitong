/**
 * 抽奖系统路由
 */
import { Router } from 'express';
import { authMiddleware, requireMemberJwt } from '../../middlewares/auth.js';
import { requireEmployee, requireAdminRole } from '../../security/accessScope.js';
import { lotteryDrawBurstLimiter, lotteryDrawLimiter } from '../../middlewares/rateLimit.js';
import {
  drawController,
  quotaController,
  myLogsController,
  memberPrizesController,
  adminListPrizesController,
  adminSavePrizesController,
  adminListLogsController,
  adminGetSettingsController,
  adminSaveSettingsController,
} from './controller.js';
import { spinSimFeedController } from './spinFakeFeedController.js';
import { adminGetSimFakeSettingsController, adminSaveSimFakeSettingsController } from './simFakeAdminController.js';
import {
  adminGetSimulationSettingsController,
  adminListSimulationFeedController,
  adminListSpinFakeHourRunsController,
  adminSaveSimulationSettingsController,
  adminStartSpinFakeCronController,
} from './simulationAdminController.js';

const router = Router();

// 会员端
router.post(
  '/draw',
  authMiddleware,
  requireMemberJwt,
  lotteryDrawBurstLimiter,
  lotteryDrawLimiter,
  drawController,
);
router.get('/quota/:memberId', authMiddleware, quotaController);
router.get('/logs/:memberId', authMiddleware, myLogsController);
router.get('/prizes/:memberId', authMiddleware, memberPrizesController);
/** 模拟中奖 feed（会员 JWT，按租户隔离；轮询；lottery_simulation_feed） */
router.get('/sim-feed', authMiddleware, requireMemberJwt, spinSimFeedController);

// 管理端 — requireEmployee 阻止会员 JWT, requireAdminRole 限制仅管理员可操作
router.get('/admin/prizes', authMiddleware, requireEmployee, adminListPrizesController);
router.post('/admin/prizes', authMiddleware, requireEmployee, requireAdminRole, adminSavePrizesController);
router.get('/admin/logs', authMiddleware, requireEmployee, adminListLogsController);
router.get('/admin/settings', authMiddleware, requireEmployee, adminGetSettingsController);
router.post('/admin/settings', authMiddleware, requireEmployee, requireAdminRole, adminSaveSettingsController);
router.get('/admin/sim-fake-settings', authMiddleware, requireEmployee, adminGetSimFakeSettingsController);
router.post('/admin/sim-fake-settings', authMiddleware, requireEmployee, requireAdminRole, adminSaveSimFakeSettingsController);
router.get('/admin/simulation-settings', authMiddleware, requireEmployee, adminGetSimulationSettingsController);
router.post('/admin/simulation-settings', authMiddleware, requireEmployee, requireAdminRole, adminSaveSimulationSettingsController);
router.get('/admin/simulation-feed', authMiddleware, requireEmployee, adminListSimulationFeedController);
router.get('/admin/simulation-hour-runs', authMiddleware, requireEmployee, adminListSpinFakeHourRunsController);
router.post('/admin/simulation-cron-start', authMiddleware, requireEmployee, requireAdminRole, adminStartSpinFakeCronController);

export default router;
