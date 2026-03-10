// Reward Type Store - 奖励类型配置管理
// 迁移到数据库 - 使用 shared_data_store 表存储

import { loadSharedData, saveSharedData, saveSharedDataSync } from '@/services/sharedDataService';

export interface RewardType {
  id: string;
  value: string;
  label: string;
  isActive: boolean;
}

const DEFAULT_REWARD_TYPES: RewardType[] = [
  { id: '1', value: 'gift_reward', label: '赠送奖励', isActive: true },
  { id: '2', value: 'referral_reward', label: '推荐奖励', isActive: true },
  { id: '3', value: 'consumption_reward', label: '消费奖励', isActive: true },
];

// 内存缓存
let typesCache: RewardType[] | null = null;

export function getRewardTypes(): RewardType[] {
  if (typesCache) {
    // 异步刷新缓存
    loadSharedData<RewardType[]>('rewardTypeSettings').then(data => {
      if (data) typesCache = data;
    }).catch(console.error);
    return typesCache;
  }
  
  // 初次加载使用默认值，同时异步加载
  loadSharedData<RewardType[]>('rewardTypeSettings').then(data => {
    if (data) typesCache = data;
  }).catch(console.error);
  
  // 生产锁定模式：数据为空时返回空数组，不自动生成
  return [];
}

export function getActiveRewardTypes(): RewardType[] {
  return getRewardTypes().filter(t => t.isActive);
}

export function saveRewardTypes(types: RewardType[]): void {
  typesCache = types;
  saveSharedDataSync('rewardTypeSettings', types);
}

export function addRewardType(label: string): RewardType {
  const types = getRewardTypes();
  const newType: RewardType = {
    id: Date.now().toString(),
    value: `type_${Date.now()}`,
    label,
    isActive: true,
  };
  types.push(newType);
  saveRewardTypes(types);
  return newType;
}

export function updateRewardType(id: string, updates: Partial<RewardType>): void {
  const types = getRewardTypes();
  const index = types.findIndex(t => t.id === id);
  if (index !== -1) {
    types[index] = { ...types[index], ...updates };
    saveRewardTypes(types);
  }
}

export function deleteRewardType(id: string): void {
  const types = getRewardTypes().filter(t => t.id !== id);
  saveRewardTypes(types);
}

// 异步初始化
export async function initializeRewardTypes(): Promise<void> {
  try {
    const data = await loadSharedData<RewardType[]>('rewardTypeSettings');
    if (data) {
      typesCache = data;
    }
    console.log('[RewardTypes] Initialized from database');
  } catch (error) {
    console.error('[RewardTypes] Failed to initialize:', error);
  }
}

// 异步获取
export async function getRewardTypesAsync(): Promise<RewardType[]> {
  const data = await loadSharedData<RewardType[]>('rewardTypeSettings');
  if (data) {
    typesCache = data;
    return typesCache;
  }
  return [];
}
