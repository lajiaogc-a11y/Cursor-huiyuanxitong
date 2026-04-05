/**
 * 会员门户设置 API 路由
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  createVersionController,
  getSettingsController,
  listVersionsController,
  rollbackVersionController,
  getDefaultSettingsPublicController,
  getSettingsByAccountPublicController,
  getSettingsByInviteTokenPublicController,
  getSettingsByMemberController,
  listSpinWheelPrizesController,
  upsertSpinWheelPrizesController,
  listSpinWheelPrizesByMemberController,
  listCheckInsController,
  listLotteryPointsLedgerController,
  listSpinCreditsLogController,
  saveDraftController,
  getDraftController,
  publishDraftController,
  discardDraftController,
} from './controller.js';
import {
  listInviteLeaderboardFakeUsersController,
  patchInviteLeaderboardFakeUserController,
  postInviteLeaderboardFakeUserToggleController,
  postInviteLeaderboardFakeUserResetGrowthController,
  postInviteLeaderboardDeleteAllFakesController,
  postInviteLeaderboardRandomizeFakeBaseController,
  postInviteLeaderboardSeedController,
  postInviteLeaderboardRunGrowthNowController,
  getInviteLeaderboardGrowthSettingsController,
  patchInviteLeaderboardGrowthSettingsController,
  postInviteLeaderboardResetCycleController,
} from '../inviteLeaderboard/adminController.js';

const router = Router();

// 公开端点
router.get('/default', getDefaultSettingsPublicController);
router.get('/by-account/:account', getSettingsByAccountPublicController);
router.get('/by-invite-token/:token', getSettingsByInviteTokenPublicController);

// 需要鉴权的端点
router.get('/', authMiddleware, getSettingsController);
router.get('/by-member/:memberId', authMiddleware, getSettingsByMemberController);
router.get('/versions', authMiddleware, listVersionsController);
router.post('/versions', authMiddleware, createVersionController);
router.post('/versions/:versionId/rollback', authMiddleware, rollbackVersionController);

// 草稿 / 发布
router.get('/draft', authMiddleware, getDraftController);
router.post('/draft', authMiddleware, saveDraftController);
router.post('/publish', authMiddleware, publishDraftController);
router.delete('/draft', authMiddleware, discardDraftController);

// Spin Wheel Prizes
router.get('/spin-wheel-prizes', authMiddleware, listSpinWheelPrizesController);
router.post('/spin-wheel-prizes', authMiddleware, upsertSpinWheelPrizesController);
router.get('/spin-wheel-prizes/by-member/:memberId', authMiddleware, listSpinWheelPrizesByMemberController);

/** 签到流水（员工 JWT，按租户） */
router.get('/check-ins', authMiddleware, listCheckInsController);

/** 抽奖获得积分流水（员工 JWT，按租户，支持 q 搜索） */
router.get('/lottery-points-ledger', authMiddleware, listLotteryPointsLedgerController);

/** 抽奖次数流水（员工 JWT，按租户） */
router.get('/spin-credits-log', authMiddleware, listSpinCreditsLogController);

/** 邀请排行榜 — 系统假用户（活动数据 → 邀请设置） */
router.get('/invite-leaderboard/fake-users', authMiddleware, listInviteLeaderboardFakeUsersController);
router.patch('/invite-leaderboard/fake-users/:id', authMiddleware, patchInviteLeaderboardFakeUserController);
router.post('/invite-leaderboard/fake-users/:id/toggle', authMiddleware, postInviteLeaderboardFakeUserToggleController);
router.post('/invite-leaderboard/fake-users/:id/reset-growth', authMiddleware, postInviteLeaderboardFakeUserResetGrowthController);
router.post('/invite-leaderboard/fake-users/delete-all', authMiddleware, postInviteLeaderboardDeleteAllFakesController);
router.post('/invite-leaderboard/fake-users/randomize-base', authMiddleware, postInviteLeaderboardRandomizeFakeBaseController);
router.post('/invite-leaderboard/seed', authMiddleware, postInviteLeaderboardSeedController);
router.get('/invite-leaderboard/growth-settings', authMiddleware, getInviteLeaderboardGrowthSettingsController);
router.patch('/invite-leaderboard/growth-settings', authMiddleware, patchInviteLeaderboardGrowthSettingsController);
router.post('/invite-leaderboard/run-growth-now', authMiddleware, postInviteLeaderboardRunGrowthNowController);
router.post('/invite-leaderboard/reset-cycle', authMiddleware, postInviteLeaderboardResetCycleController);

export default router;
