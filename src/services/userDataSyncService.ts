// ============= User Data Sync Service =============
// 用户数据同步服务 — 持久化走 user_data_store 等数据库表；无 localStorage 业务真源。
// 注意：大部分业务数据已迁移到专用数据库表
// 此服务主要用于用户级别的个人偏好设置同步

import { dataTableApi } from "@/api/data";
import { getCurrentUserApi } from "@/services/auth/authApiService";

// 定义需要同步的用户个人数据键
// 注意：以下数据已迁移到专用数据库表，不再通过此服务同步：
// - 订单数据 → orders 表
// - 会员数据 → members 表
// - 积分数据 → points_ledger, points_accounts 表
// - 活动赠送 → activity_gifts 表
// - 推荐关系 → referral_relations 表
// - 操作日志 → operation_logs 表
// - 商家配置 → cards, vendors, payment_providers 表
// - 客户来源 → customer_sources 表
// - 共享配置 → shared_data_store 表

// 用户数据同步键 - 仅保留实际使用的键
// 所有业务数据已迁移到专用数据库表，此服务仅用于用户个人偏好设置
export const SYNC_KEYS = {
  // 用户个人偏好设置
  USER_PREFERENCES: 'user_preferences',
  // 交班对账表单草稿（每个用户独立）
  SHIFT_HANDOVER_FORM: 'shift_handover_form',
  // 新增会员表单草稿（每个用户独立）
  MEMBER_ENTRY_FORM: 'member_entry_form',
} as const;

export type SyncKey = typeof SYNC_KEYS[keyof typeof SYNC_KEYS];

// 获取当前用户ID（employee_id，用于 user_data_store 隔离）
async function getCurrentUserId(): Promise<string | null> {
  const authUser = await getCurrentUserApi();
  return authUser?.id || null;
}

// 从数据库加载数据（必须用员工 JWT：同浏览器登录会员时，pathname 在 /member 下普通 apiGet 会误带会员 token 导致 table 代理 403）
export async function loadFromDatabase(dataKey: SyncKey): Promise<any | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const row = await dataTableApi.getAsStaff<{ data_value?: unknown } | null>(
      "user_data_store",
      `select=data_value&user_id=eq.${encodeURIComponent(userId)}&data_key=eq.${encodeURIComponent(dataKey)}&single=true`,
    );

    return row?.data_value ?? null;
  } catch (error) {
    console.error(`Error loading ${dataKey}:`, error);
    return null;
  }
}

// 保存数据到数据库
export async function saveToDatabase(dataKey: SyncKey, value: any): Promise<boolean> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;
    
    await dataTableApi.postAsStaff("user_data_store", {
      data: {
        user_id: userId,
        data_key: dataKey,
        data_value: value,
        updated_at: new Date().toISOString(),
      },
      upsert: true,
      onConflict: 'user_id,data_key',
    });

    return true;
  } catch (error) {
    console.error(`Error saving ${dataKey}:`, error);
    return false;
  }
}

// 初始化同步 - 登录后调用
// 注意：此函数现在只同步用户个人偏好，业务数据由各自的服务/hooks管理
export async function initializeUserDataSync(): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;
  
  console.log('[UserDataSync] Initializing user preferences sync...');
  
  // 只同步用户个人偏好
  const preferencesKeys = [SYNC_KEYS.USER_PREFERENCES];
  
  const syncPromises = preferencesKeys.map(async (key) => {
    await loadFromDatabase(key);
  });
  
  await Promise.all(syncPromises);
  console.log('[UserDataSync] User preferences sync completed');
}

// 创建带同步的存储包装器（纯数据库版本，不使用 localStorage）
export function createSyncedStorage<T>(dataKey: SyncKey, defaultValue: T) {
  let memoryCache: T | null = null;
  
  return {
    get: (): T => {
      return memoryCache ?? defaultValue;
    },
    
    set: async (value: T): Promise<void> => {
      memoryCache = value;
      await saveToDatabase(dataKey, value);
    },
    
    syncFromDb: async (): Promise<T | null> => {
      const data = await loadFromDatabase(dataKey);
      if (data !== null) {
        memoryCache = data;
      }
      return data;
    },
  };
}
