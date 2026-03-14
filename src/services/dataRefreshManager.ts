import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { emitDataRefresh, emitLegacyEvents, queueQueryInvalidations } from '@/services/dataConsistencyHub';

type DataTable =
  | 'orders'
  | 'members'
  | 'points_ledger'
  | 'activity_gifts'
  | 'ledger_transactions'
  | 'member_activity'
  | 'points_accounts'
  | 'payment_providers'
  | 'vendors'
  | 'cards';

type DataRefreshPayload = {
  table: DataTable;
  operation?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  source?: 'mutation' | 'realtime' | 'manual';
};

const TABLE_QUERY_KEYS: Record<DataTable, string[][]> = {
  orders: [
    ['orders'],
    ['usdt-orders'],
    ['dashboard-trend'],
    ['profit-compare-current'],
    ['profit-compare-previous'],
    ['report-filtered'],
    ['activity-data-content'],
    ['member-activity-page-data'],
  ],
  members: [
    ['members'],
    ['dashboard-trend'],
    ['report-base'],
    ['activity-data-content'],
    ['member-activity-page-data'],
  ],
  points_ledger: [
    ['points-ledger'],
    ['activity-data-content'],
    ['member-activity-page-data'],
  ],
  activity_gifts: [
    ['activity-gifts'],
    ['report-filtered'],
    ['activity-data-content'],
    ['member-activity-page-data'],
  ],
  ledger_transactions: [
    ['merchant-settlement'],
    ['activity-data-content'],
  ],
  member_activity: [
    ['activity-data-content'],
    ['member-activity-page-data'],
  ],
  points_accounts: [
    ['activity-data-content'],
    ['member-activity-page-data'],
  ],
  payment_providers: [
    ['report-base'],
    ['activity-data-content'],
    ['member-activity-page-data'],
  ],
  vendors: [['report-base']],
  cards: [['report-base']],
};

const TABLE_LEGACY_EVENTS: Record<DataTable, string[]> = {
  orders: ['report-cache-invalidate', 'leaderboard-refresh', 'points-updated'],
  members: ['member-refresh', 'report-cache-invalidate'],
  points_ledger: ['points-updated'],
  activity_gifts: ['activity-gifts-updated', 'report-cache-invalidate'],
  ledger_transactions: ['ledger-updated', 'balance-log-updated'],
  member_activity: ['member-refresh'],
  points_accounts: ['points-updated'],
  payment_providers: [],
  vendors: [],
  cards: [],
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
  if (table === 'payment_providers' || table === 'vendors' || table === 'cards') {
    const { resetMerchantConfigCache } = await import('@/stores/merchantConfigStore');
    resetMerchantConfigCache();
  }
  if (table === 'ledger_transactions') {
    const { resetSettlementCache } = await import('@/stores/merchantSettlementStore');
    resetSettlementCache();
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
  subscribeKeyTable('points_ledger');
  subscribeKeyTable('activity_gifts');
  subscribeKeyTable('ledger_transactions');
  subscribeKeyTable('member_activity');
  subscribeKeyTable('points_accounts');
  subscribeKeyTable('payment_providers');
  subscribeKeyTable('vendors');
  subscribeKeyTable('cards');
  refreshChannel.subscribe();

  return () => {
    if (refreshChannel) {
      supabase.removeChannel(refreshChannel);
      refreshChannel = null;
    }
    initialized = false;
  };
}

