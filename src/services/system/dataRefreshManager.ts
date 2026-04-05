/**
 * 数据刷新管理器
 * 原 supabase realtime 订阅已改为 stub（空实现）
 * 保留 notifyDataMutation 用于手动/mutation 触发刷新
 */

import { emitDataRefresh, emitLegacyEvents, queueQueryInvalidations } from '@/services/system/dataConsistencyHub';
import { TABLE_LEGACY_EVENTS, TABLE_QUERY_KEYS, type DataTable } from '@/services/system/unifiedRefreshQueryMap';
import { resetReferralCache } from '@/stores/referralStore';
import { clearCache as clearSharedDataCache } from '@/services/finance/sharedDataService';
import { refreshEmployees } from '@/services/members/nameResolver';
import { resetPointsSettingsCache } from '@/stores/pointsSettingsStore';

export type DataRefreshPayload = {
  table: DataTable;
  operation?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  source?: 'mutation' | 'realtime' | 'manual';
};

let initialized = false;

/**
 * 会员门户修改昵称等操作后写入；其他标签页（员工端）通过 `storage` 事件收到并刷新会员列表。
 * 同源策略下仅跨标签页触发，写入方本标签页不会收到。
 */
export const GC_MEMBERS_LIST_STALE_STORAGE_KEY = 'gc-members-list-stale-v1';

/** 通知其他标签页：会员表相关展示应重新拉取（与 notifyDataMutation 配合使用） */
export function broadcastMembersListStale(): void {
  try {
    localStorage.setItem(GC_MEMBERS_LIST_STALE_STORAGE_KEY, String(Date.now()));
  } catch {
    /* private mode / quota */
  }
}

function setupMembersCrossTabSync(): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== GC_MEMBERS_LIST_STALE_STORAGE_KEY || e.newValue == null) return;
    void notifyDataMutation({ table: 'members', operation: 'UPDATE', source: 'realtime' });
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

function clearStoreCachesByTable(table: DataTable) {
  if (table === 'points_ledger') {
    // usePointsLedger hook listens to 'data-refresh' events and auto-invalidates;
    // the legacy pointsLedgerStore cache is no longer the authoritative source.
  }
  if (table === 'points_accounts') {
    import('@/stores/pointsAccountStore').then(m => m.resetPointsAccountCache()).catch(() => {});
  }
  if (table === 'members') {
    resetReferralCache();
  }
  if (table === 'employees') {
    refreshEmployees().catch((err) => { console.warn('[dataRefreshManager] refreshEmployees failed:', err); });
  }
  if (table === 'payment_providers' || table === 'vendors' || table === 'cards') {
    import('@/stores/merchantConfigStore').then(m => m.resetMerchantConfigCache()).catch(() => {});
  }
  if (table === 'shared_data_store') {
    clearSharedDataCache();
    import('@/stores/merchantConfigStore').then(m => m.resetMerchantConfigCache()).catch(() => {});
    import('@/stores/exchangeRateStore').then(m => m.resetExchangeRateCache()).catch(() => {});
    resetPointsSettingsCache();
    import('@/stores/activitySettingsStore').then(m => m.resetActivitySettingsCache()).catch(() => {});
  }
}

export function notifyDataMutation(payload: DataRefreshPayload): Promise<void> {
  try {
    const queryKeys = TABLE_QUERY_KEYS[payload.table] || [];
    queueQueryInvalidations(queryKeys);
    emitLegacyEvents(TABLE_LEGACY_EVENTS[payload.table]);
    emitDataRefresh(payload);
    clearStoreCachesByTable(payload.table);
  } catch (e) {
    console.error('[DataRefreshManager] notifyDataMutation error:', e);
  }
  return Promise.resolve();
}

/**
 * 初始化数据刷新管理器
 * STUB: 原 supabase realtime channel 订阅已移除，返回空清理函数
 * 后续可替换为 WebSocket / SSE 等实时方案
 */
export function initDataRefreshManager(): () => void {
  if (initialized) return () => {};
  initialized = true;

  const cleanupCrossTab = setupMembersCrossTabSync();

  console.info('[DataRefreshManager] Initialized (realtime subscription stubbed out)');

  return () => {
    cleanupCrossTab();
    initialized = false;
  };
}
