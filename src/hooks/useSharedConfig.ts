// ============= useSharedConfig Hook =============
// 共享配置 Hook - 用于读写全局共享配置

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SharedDataKey } from '@/services/finance/sharedDataService';
import {
  loadSharedData,
  saveSharedData,
  subscribeToSharedData,
} from '@/services/finance/sharedDataService';

interface UseSharedConfigOptions<T> {
  dataKey: SharedDataKey;
  defaultValue: T;
  autoSubscribe?: boolean;
}

interface UseSharedConfigReturn<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  save: (value: T) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useSharedConfig<T>(
  options: UseSharedConfigOptions<T>
): UseSharedConfigReturn<T> {
  const { dataKey, defaultValue, autoSubscribe = true } = options;
  
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // 加载数据
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await loadSharedData<T>(dataKey);
      if (result !== null) {
        setData(result);
      } else {
        setData(defaultValue);
      }
    } catch (err) {
      setError(err as Error);
      console.error(`[useSharedConfig] Failed to load ${dataKey}:`, err);
    } finally {
      setLoading(false);
    }
  }, [dataKey, defaultValue]);

  // 保存数据
  const save = useCallback(async (value: T): Promise<boolean> => {
    try {
      const success = await saveSharedData(dataKey, value);
      if (success) {
        setData(value);
      }
      return success;
    } catch (err) {
      setError(err as Error);
      console.error(`[useSharedConfig] Failed to save ${dataKey}:`, err);
      return false;
    }
  }, [dataKey]);

  // 刷新数据
  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  // 初始加载
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 实时订阅
  useEffect(() => {
    if (!autoSubscribe) return;

    const unsubscribe = subscribeToSharedData((key, value) => {
      if (key === dataKey) {
        setData(value as T);
      }
    });

    return unsubscribe;
  }, [dataKey, autoSubscribe]);

  return {
    data,
    loading,
    error,
    save,
    refresh,
  };
}

// ============= 特定配置的便捷 Hooks =============

// 费用设置 Hook
export interface FeeSettingsData {
  nairaThreshold: number;
  nairaThresholdFee: number;
  cediThreshold: number;
  cediThresholdFee: number;
  usdtFee: number;
}

const DEFAULT_FEE_SETTINGS: FeeSettingsData = {
  nairaThreshold: 100000,
  nairaThresholdFee: 200,
  cediThreshold: 500,
  cediThresholdFee: 2,
  usdtFee: 1,
};

export function useFeeSettings() {
  return useSharedConfig<FeeSettingsData>({
    dataKey: 'feeSettings',
    defaultValue: DEFAULT_FEE_SETTINGS,
  });
}

// TRX 设置 Hook
export interface TrxSettingsData {
  rate: number;
  quantity: number;
  lastUpdated: string;
}

const DEFAULT_TRX_SETTINGS: TrxSettingsData = {
  rate: 0,
  quantity: 0,
  lastUpdated: new Date().toISOString(),
};

export function useTrxSettings() {
  return useSharedConfig<TrxSettingsData>({
    dataKey: 'trxSettings',
    defaultValue: DEFAULT_TRX_SETTINGS,
  });
}

// 积分设置 Hook
export interface PointsSettingsData {
  pointsMode: 'auto' | 'manual';
  ngnToUsdRate: number;
  ghsToUsdRate: number;
  pointsMultiplier: number;
  lastAutoUpdateTime: string | null;
  isActivity1Enabled: boolean;
  isActivity2Enabled: boolean;
}

const DEFAULT_POINTS_SETTINGS: PointsSettingsData = {
  pointsMode: 'manual',
  ngnToUsdRate: 1650,
  ghsToUsdRate: 16,
  pointsMultiplier: 1,
  lastAutoUpdateTime: null,
  isActivity1Enabled: true,
  isActivity2Enabled: true,
};

export function usePointsSettings() {
  return useSharedConfig<PointsSettingsData>({
    dataKey: 'points_settings',
    defaultValue: DEFAULT_POINTS_SETTINGS,
  });
}

// 活动设置 Hook
export interface AccumulatedRewardTier {
  id: string;
  minPoints: number;
  maxPoints: number | null;
  rewardAmountNGN: number;
  rewardAmountGHS: number;
  rewardAmountUSDT: number;
}

export interface ReferralRewardConfig {
  isEnabled: boolean;
  pointsPerReferral: number;
}

export interface Activity2Config {
  pointsToNGN: number;
  pointsToGHS: number;
}

export interface ActivitySettingsData {
  accumulatedRewardTiers: AccumulatedRewardTier[];
  referralReward: ReferralRewardConfig;
  activity2Config: Activity2Config;
}

const DEFAULT_ACTIVITY_SETTINGS: ActivitySettingsData = {
  accumulatedRewardTiers: [],
  referralReward: {
    isEnabled: true,
    pointsPerReferral: 5,
  },
  activity2Config: {
    pointsToNGN: 1000,
    pointsToGHS: 10,
  },
};

export function useActivitySettings() {
  return useSharedConfig<ActivitySettingsData>({
    dataKey: 'activitySettings',
    defaultValue: DEFAULT_ACTIVITY_SETTINGS,
  });
}

// 国家设置 Hook
export interface CountryData {
  id: string;
  name: string;
  remark?: string;
}

export function useCountries() {
  return useSharedConfig<CountryData[]>({
    dataKey: 'countries',
    defaultValue: [],
  });
}

// 工作备忘 Hook
export interface WorkMemoData {
  id: string;
  phoneNumber: string;
  remark: string;
  reminderTime: string | null;
  createdAt: string;
  isRead: boolean;
  isTriggered: boolean;
}

export function useWorkMemos() {
  return useSharedConfig<WorkMemoData[]>({
    dataKey: 'workMemos',
    defaultValue: [],
  });
}
