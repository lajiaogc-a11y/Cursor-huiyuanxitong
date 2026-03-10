// Activity Settings Store - 活动规则配置
// 所有数据存储在线上数据库，不使用本地存储

import { CurrencyCode } from "@/config/currencies";
import { loadSharedData, saveSharedData, saveSharedDataSync } from '@/services/sharedDataService';
import { supabase } from '@/integrations/supabase/client';
import { logOperation } from './auditLogStore';

// 累积兑换奖励档位 - 支持三种货币
export interface AccumulatedRewardTier {
  id: string;
  minPoints: number;
  maxPoints: number | null;
  rewardAmountNGN: number;
  rewardAmountGHS: number;
  rewardAmountUSDT: number;
  // 旧字段兼容
  rewardAmount?: number;
  rewardCurrency?: CurrencyCode;
}

// 推荐奖励配置
export interface ReferralRewardConfig {
  enabled: boolean;
  rewardPoints: number;
  rewardAmountUsd?: number;
}

// 活动2配置
export interface Activity2Config {
  enabled: boolean;
  pointsToNGN: number;
  pointsToGHS: number;
  pointsToUSDT: number;
}

// 活动设置
export interface ActivitySettings {
  accumulatedRewardTiers: AccumulatedRewardTier[];
  referralReward: ReferralRewardConfig;
  activity1Enabled: boolean;
  activity2: Activity2Config;
}

const DEFAULT_ACTIVITY_SETTINGS: ActivitySettings = {
  accumulatedRewardTiers: [
    { id: "tier1", minPoints: 0, maxPoints: 100, rewardAmountNGN: 500, rewardAmountGHS: 50, rewardAmountUSDT: 0.5 },
    { id: "tier2", minPoints: 100, maxPoints: 500, rewardAmountNGN: 2000, rewardAmountGHS: 200, rewardAmountUSDT: 2 },
    { id: "tier3", minPoints: 500, maxPoints: null, rewardAmountNGN: 5000, rewardAmountGHS: 500, rewardAmountUSDT: 5 },
  ],
  referralReward: {
    enabled: true,
    rewardPoints: 1,
  },
  activity1Enabled: true,
  activity2: {
    enabled: false,
    pointsToNGN: 100,
    pointsToGHS: 10,
    pointsToUSDT: 0.1,
  },
};

// 内存缓存
let settingsCache: ActivitySettings | null = null;

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// 数据迁移：将旧格式转换为新格式
function migrateSettings(parsed: any): ActivitySettings {
  if (parsed.accumulatedRewardTiers) {
    parsed.accumulatedRewardTiers = parsed.accumulatedRewardTiers.map((tier: any) => {
      if (tier.rewardAmountNGN !== undefined) {
        return tier;
      }
      const oldAmount = tier.rewardAmount || 0;
      const oldCurrency = tier.rewardCurrency || "NGN";
      return {
        ...tier,
        rewardAmountNGN: oldCurrency === "NGN" ? oldAmount : 0,
        rewardAmountGHS: oldCurrency === "GHS" ? oldAmount : 0,
        rewardAmountUSDT: oldCurrency === "USDT" ? oldAmount : 0,
      };
    });
  }
  
  if (parsed.referralReward?.rewardAmountUsd !== undefined && parsed.referralReward?.rewardPoints === undefined) {
    parsed.referralReward.rewardPoints = Math.round(parsed.referralReward.rewardAmountUsd) || 1;
  }
  
  if (parsed.activity1Enabled === undefined) {
    parsed.activity1Enabled = true;
  }
  
  if (!parsed.activity2) {
    parsed.activity2 = DEFAULT_ACTIVITY_SETTINGS.activity2;
  }
  
  return parsed;
}

export function getActivitySettings(): ActivitySettings {
  if (settingsCache) {
    // 异步刷新缓存
    loadSharedData<ActivitySettings>('activitySettings').then(data => {
      if (data) settingsCache = migrateSettings(data);
    }).catch(console.error);
    return settingsCache;
  }
  
  // 初次加载使用默认值，同时异步加载
  loadSharedData<ActivitySettings>('activitySettings').then(data => {
    if (data) settingsCache = migrateSettings(data);
  }).catch(console.error);
  
  return DEFAULT_ACTIVITY_SETTINGS;
}

export function saveActivitySettings(settings: ActivitySettings): void {
  settingsCache = settings;
  saveSharedDataSync('activitySettings', settings);
  
  // 同步到 activity_reward_tiers 表
  syncTiersToDatabase(settings.accumulatedRewardTiers).catch(console.error);
}

// 同步奖励层级到数据库表
async function syncTiersToDatabase(tiers: AccumulatedRewardTier[]): Promise<void> {
  try {
    // 删除所有现有记录
    await supabase.from('activity_reward_tiers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // 插入新记录
    if (tiers.length > 0) {
      const dbTiers = tiers.map((tier, index) => ({
        min_points: tier.minPoints,
        max_points: tier.maxPoints,
        reward_amount_ngn: tier.rewardAmountNGN,
        reward_amount_ghs: tier.rewardAmountGHS,
        reward_amount_usdt: tier.rewardAmountUSDT,
        sort_order: index,
      }));
      
      await supabase.from('activity_reward_tiers').insert(dbTiers);
    }
  } catch (error) {
    console.error('[ActivitySettings] Failed to sync tiers to database:', error);
  }
}

// 累积兑换奖励档位操作
export function addRewardTier(
  minPoints: number,
  maxPoints: number | null,
  rewardAmountNGN: number,
  rewardAmountGHS: number,
  rewardAmountUSDT: number
): AccumulatedRewardTier {
  const settings = getActivitySettings();
  const newTier: AccumulatedRewardTier = {
    id: generateId(),
    minPoints,
    maxPoints,
    rewardAmountNGN,
    rewardAmountGHS,
    rewardAmountUSDT,
  };
  
  settings.accumulatedRewardTiers.push(newTier);
  settings.accumulatedRewardTiers.sort((a, b) => a.minPoints - b.minPoints);
  recalculateTierRanges(settings.accumulatedRewardTiers);
  
  saveActivitySettings(settings);
  
  // 记录操作日志
  logOperation('system_settings', 'create', newTier.id, null, newTier, `新增奖励档位: ${minPoints}-${maxPoints ?? '∞'} 积分`);
  
  return newTier;
}

export function updateRewardTier(
  tierId: string,
  updates: Partial<AccumulatedRewardTier>
): void {
  const settings = getActivitySettings();
  const tierIndex = settings.accumulatedRewardTiers.findIndex(t => t.id === tierId);
  
  if (tierIndex !== -1) {
    const beforeTier = { ...settings.accumulatedRewardTiers[tierIndex] };
    
    settings.accumulatedRewardTiers[tierIndex] = {
      ...settings.accumulatedRewardTiers[tierIndex],
      ...updates,
    };
    
    settings.accumulatedRewardTiers.sort((a, b) => a.minPoints - b.minPoints);
    recalculateTierRanges(settings.accumulatedRewardTiers);
    
    saveActivitySettings(settings);
    
    // 记录操作日志
    const afterTier = settings.accumulatedRewardTiers.find(t => t.id === tierId);
    logOperation('system_settings', 'update', tierId, beforeTier, afterTier, `修改奖励档位: ${beforeTier.minPoints}-${beforeTier.maxPoints ?? '∞'} 积分`);
  }
}

export function deleteRewardTier(tierId: string): boolean {
  const settings = getActivitySettings();
  const tierIndex = settings.accumulatedRewardTiers.findIndex(t => t.id === tierId);
  
  if (tierIndex === -1) return false;
  
  const tier = settings.accumulatedRewardTiers[tierIndex];
  if (tier.maxPoints === null) {
    return false;
  }
  
  if (settings.accumulatedRewardTiers.length <= 1) {
    return false;
  }
  
  const deletedTier = { ...tier };
  settings.accumulatedRewardTiers.splice(tierIndex, 1);
  recalculateTierRanges(settings.accumulatedRewardTiers);
  
  saveActivitySettings(settings);
  
  // 记录操作日志
  logOperation('system_settings', 'delete', tierId, deletedTier, null, `删除奖励档位: ${deletedTier.minPoints}-${deletedTier.maxPoints ?? '∞'} 积分`);
  
  return true;
}

function recalculateTierRanges(tiers: AccumulatedRewardTier[]): void {
  if (tiers.length === 0) return;
  
  tiers.sort((a, b) => a.minPoints - b.minPoints);
  
  for (let i = 0; i < tiers.length; i++) {
    if (i === tiers.length - 1) {
      tiers[i].maxPoints = null;
    } else {
      tiers[i].maxPoints = tiers[i + 1].minPoints;
    }
  }
}

export function updateReferralReward(config: Partial<ReferralRewardConfig>): void {
  const settings = getActivitySettings();
  settings.referralReward = {
    ...settings.referralReward,
    ...config,
  };
  saveActivitySettings(settings);
}

export function getRewardTierByPoints(points: number): AccumulatedRewardTier | null {
  const settings = getActivitySettings();
  
  const matchingTiers = settings.accumulatedRewardTiers.filter(
    tier => points >= tier.minPoints
  );
  
  if (matchingTiers.length === 0) {
    return null;
  }
  
  return matchingTiers.reduce((highest, current) => 
    current.minPoints > highest.minPoints ? current : highest
  );
}

export function getRewardAmountByPointsAndCurrency(points: number, currency: CurrencyCode): number {
  const tier = getRewardTierByPoints(points);
  if (!tier) return 0;
  
  switch (currency) {
    case "NGN":
      return tier.rewardAmountNGN;
    case "GHS":
      return tier.rewardAmountGHS;
    case "USDT":
      return tier.rewardAmountUSDT;
    default:
      return 0;
  }
}

// ========== Async Functions ==========

export async function getActivitySettingsAsync(): Promise<ActivitySettings> {
  const data = await loadSharedData<ActivitySettings>('activitySettings');
  if (data) {
    settingsCache = migrateSettings(data);
    return settingsCache;
  }
  return DEFAULT_ACTIVITY_SETTINGS;
}

export async function saveActivitySettingsAsync(settings: ActivitySettings): Promise<boolean> {
  settingsCache = settings;
  const success = await saveSharedData('activitySettings', settings);
  
  if (success) {
    await syncTiersToDatabase(settings.accumulatedRewardTiers);
  }
  
  return success;
}

// ========== Initialize ==========

export async function initializeActivitySettings(): Promise<void> {
  try {
    const data = await loadSharedData<ActivitySettings>('activitySettings');
    if (data) {
      settingsCache = migrateSettings(data);
    }
    console.log('[ActivitySettings] Initialized from database');
  } catch (error) {
    console.error('[ActivitySettings] Failed to initialize:', error);
  }
}
