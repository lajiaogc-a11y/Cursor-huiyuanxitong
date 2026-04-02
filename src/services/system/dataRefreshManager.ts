/**
 * 数据刷新管理器
 * 原 supabase realtime 订阅已改为 stub（空实现）
 * 保留 notifyDataMutation 用于手动/mutation 触发刷新
 */

import { emitDataRefresh, emitLegacyEvents, queueQueryInvalidations } from '@/services/system/dataConsistencyHub';
import { TABLE_LEGACY_EVENTS, TABLE_QUERY_KEYS, type DataTable } from '@/services/system/unifiedRefreshQueryMap';
import { resetPointsLedgerCache } from '@/stores/pointsLedgerStore';
import { resetPointsAccountCache } from '@/stores/pointsAccountStore';
import { resetReferralCache } from '@/stores/referralStore';
import { refreshEmployees } from '@/services/members/nameResolver';
import { resetMerchantConfigCache } from '@/stores/merchantConfigStore';
import { clearCache as clearSharedDataCache } from '@/services/finance/sharedDataService';
import { resetExchangeRateCache } from '@/stores/exchangeRateStore';
import { resetPointsSettingsCache } from '@/stores/pointsSettingsStore';
import { resetActivitySettingsCache } from '@/stores/activitySettingsStore';

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
    resetPointsLedgerCache();
  }
  if (table === 'points_accounts') {
    resetPointsAccountCache();
  }
  if (table === 'members') {
    resetReferralCache();
  }
  if (table === 'employees') {
    refreshEmployees().catch((err) => { console.warn('[dataRefreshManager] refreshEmployees failed:', err); return undefined; });
  }
  if (table === 'payment_providers' || table === 'vendors' || table === 'cards') {
    resetMerchantConfigCache();
  }
  // 账本 ledger_transactions 与 shared_data 里的 cardMerchantSettlements / paymentProviderSettlements 是独立存储；
  // 编辑充值/提款会先写结算 JSON 再记账本。此处若 reset 结算缓存会触发立刻重载，易与保存竞态或读到 null，
  // 表现为「非最新一条的充值改完就从充值明细消失」。余额仍由订单+结算数据计算，用户可点「刷新」强制拉共享数据。
  if (table === 'shared_data_store') {
    clearSharedDataCache();
    resetMerchantConfigCache();
    resetExchangeRateCache();
    resetPointsSettingsCache();
    resetActivitySettingsCache();
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
