/**
 * System Settings Service — 业务编排层
 *
 * 封装 repository 中的共享数据、IP 管控、活动数据操作
 */

export {
  getDataDebugCountsRepository as getDataDebugCounts,
  getIpAccessControlSettingRepository as getIpAccessControlSetting,
  getSharedDataRepository as getSharedData,
  upsertSharedDataRepository as upsertSharedData,
  getMultipleSharedDataRepository as getMultipleSharedData,
  listActivityDataRepository as listActivityData,
  updateActivityGiftRepository as updateActivityGift,
  deleteActivityGiftRepository as deleteActivityGift,
  getSpinCreditsDetailRepository as getSpinCreditsDetail,
} from './repository.js';

export {
  getActivityDataRetentionSettingsRepository as getActivityDataRetentionSettings,
  saveActivityDataRetentionSettingsRepository as saveActivityDataRetentionSettings,
  runManualActivityDataPurgeRepository as runManualActivityDataPurge,
  purgeAllActivityDataByTenantRepository as purgeAllActivityDataByTenant,
} from './activityDataRetentionRepository.js';
