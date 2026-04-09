/**
 * Lottery Admin Service — 管理端操作封装，供 Controller 统一调用
 * 底层调用 repository，Controller 禁止直接访问 repository
 */
export {
  listPrizes,
  upsertPrizes,
  listLotteryLogs,
  countLotteryLogsForMember,
  listAllLotteryLogs,
  countAllLotteryLogs,
  getLotterySettings,
  upsertLotterySettings,
  getMemberTenantId,
  listEnabledPrizes,
  updateMemberPortalDailyFreeSpinsPerDay,
  getLotteryOperationalTodayStats,
  getLotteryOperationalRiskStats,
  countLotteryRiskBlockedToday,
  getTodayEffectiveBudgetUsedFromLogs,
  listOperationalCostBreakdown,
  getLotteryLogTenantId,
  getTodayConsumptionPointsTotal,
  type LotteryPrize,
} from './repository.js';
