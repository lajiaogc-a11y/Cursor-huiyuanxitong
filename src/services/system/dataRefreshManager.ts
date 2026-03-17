import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { emitDataRefresh, emitLegacyEvents, queueQueryInvalidations } from '@/services/system/dataConsistencyHub';
import { TABLE_LEGACY_EVENTS, TABLE_QUERY_KEYS, type DataTable } from '@/services/system/unifiedRefreshQueryMap';

export type DataRefreshPayload = {
  table: DataTable;
  operation?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  source?: 'mutation' | 'realtime' | 'manual';
};

let refreshChannel: RealtimeChannel | null = null;
let initialized = false;

async function clearStoreCachesByTable(table: DataTable) {
  if (table === 'points_ledger') {
    const { resetPointsLedgerCache } = await import('@/stores/pointsLedgerStore');
    resetPointsLedgerCache();
  }
  if (table === 'points_accounts') {
    const { resetPointsAccountCache } = await import('@/stores/pointsAccountStore');
    resetPointsAccountCache();
  }
  if (table === 'members') {
    const { resetReferralCache } = await import('@/stores/referralStore');
    resetReferralCache();
  }
  if (table === 'employees') {
    const { refreshEmployees } = await import('@/services/members/nameResolver');
    await refreshEmployees().catch(() => undefined);
  }
  if (table === 'payment_providers' || table === 'vendors' || table === 'cards') {
    const { resetMerchantConfigCache } = await import('@/stores/merchantConfigStore');
    resetMerchantConfigCache();
  }
  if (table === 'ledger_transactions') {
    const { resetSettlementCache } = await import('@/stores/merchantSettlementStore');
    resetSettlementCache();
  }
  if (table === 'shared_data_store') {
    const { clearCache } = await import('@/services/finance/sharedDataService');
    clearCache();
    const { resetMerchantConfigCache } = await import('@/stores/merchantConfigStore');
    resetMerchantConfigCache();
    const { resetExchangeRateCache } = await import('@/stores/exchangeRateStore');
    resetExchangeRateCache();
    const { resetPointsSettingsCache } = await import('@/stores/pointsSettingsStore');
    resetPointsSettingsCache();
    const { resetActivitySettingsCache } = await import('@/stores/activitySettingsStore');
    resetActivitySettingsCache();
  }
}

export async function notifyDataMutation(payload: DataRefreshPayload) {
  const queryKeys = TABLE_QUERY_KEYS[payload.table] || [];
  queueQueryInvalidations(queryKeys);
  emitLegacyEvents(TABLE_LEGACY_EVENTS[payload.table]);
  emitDataRefresh(payload);
  await clearStoreCachesByTable(payload.table);
}

function subscribeKeyTable(table: DataTable) {
  if (!refreshChannel) return;
  refreshChannel = refreshChannel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table },
    async (payload) => {
      await notifyDataMutation({
        table,
        operation: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
        source: 'realtime',
      });
    }
  );
}

export function initDataRefreshManager(): () => void {
  if (initialized) return () => {};
  initialized = true;

  refreshChannel = supabase.channel('data-refresh-manager');
  subscribeKeyTable('orders');
  subscribeKeyTable('members');
  subscribeKeyTable('employees');
  subscribeKeyTable('points_ledger');
  subscribeKeyTable('activity_gifts');
  subscribeKeyTable('ledger_transactions');
  subscribeKeyTable('member_activity');
  subscribeKeyTable('points_accounts');
  subscribeKeyTable('payment_providers');
  subscribeKeyTable('vendors');
  subscribeKeyTable('cards');
  subscribeKeyTable('balance_change_logs');
  subscribeKeyTable('tasks');
  subscribeKeyTable('task_items');
  subscribeKeyTable('task_item_logs');
  subscribeKeyTable('notifications');
  subscribeKeyTable('shared_data_store');
  subscribeKeyTable('audit_records');
  refreshChannel.subscribe();

  return () => {
    if (refreshChannel) {
      supabase.removeChannel(refreshChannel);
      refreshChannel = null;
    }
    initialized = false;
  };
}

