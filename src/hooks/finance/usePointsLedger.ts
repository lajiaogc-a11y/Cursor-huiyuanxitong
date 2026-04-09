// ============= Points Ledger Hook - react-query Migration =============
// 积分流水 - react-query 缓存确保页面切换不重复请求；监听 data-refresh 与短周期轮询保证新数据及时展示
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE_TIME_LIST_MS } from '@/lib/reactQueryPolicy';
import {
  getPointsLedgerAllOrdered,
  getPointsLogAllOrdered,
  getPointsLedgerByMemberCodeForBalance,
  getMembersIdByMemberCode,
  getPointsLedgerByMemberIdForBalance,
} from '@/services/data/financeQueryService';
import { CurrencyCode } from '@/config/currencies';
import { 
  createPointsOnOrderCreate, 
  reversePointsOnOrderCancel,
  restorePointsOnOrderRestore,
  getPointsTypeLabel,
  type CreatePointsParams,
} from '@/services/points/pointsService';

export type PointsStatus = 'issued' | 'reversed';

export interface PointsLedgerEntry {
  id: string;
  member_id?: string | null;
  created_at: string;
  member_code: string;
  phone_number: string;
  order_id: string | null;
  transaction_type: string;
  /** 库表 type（抽奖写入 lottery；与 transaction_type 二选一时常需合并理解） */
  type?: string | null;
  amount?: number | null;
  description?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  balance_after?: number | null;
  actual_payment: number | null;
  currency: string | null;
  exchange_rate: number | null;
  usd_amount: number | null;
  points_multiplier: number | null;
  points_earned: number;
  status: PointsStatus;
  creator_id: string | null;
}

/**
 * 统一流水语义：抽奖等路径只写 type + amount，transaction_type / points_earned 可能为空。
 * 与活动数据页 ledgerAmt / ledgerTxn 规则一致，保证员工端积分明细为「全量一条时间线」。
 */
export function normalizePointsLedgerRow(raw: Record<string, unknown>): PointsLedgerEntry {
  const r = raw as Record<string, unknown>;
  const pointsEarned = Number(r.points_earned ?? r.amount ?? 0);
  const txnRaw = String(r.transaction_type || r.type || '').trim();
  const transaction_type = txnRaw || 'unknown';
  const st = r.status;
  const status: PointsStatus = st === 'reversed' ? 'reversed' : 'issued';
  return {
    ...(r as object),
    points_earned: Number.isFinite(pointsEarned) ? pointsEarned : 0,
    transaction_type,
    status,
  } as PointsLedgerEntry;
}

/**
 * Deduplicate points_log entries against points_ledger entries.
 * An entry from points_log is considered a duplicate if a points_ledger entry
 * exists with the same member_id, similar timestamp (±2s), and similar amount.
 */
function deduplicateLogRows(
  ledger: PointsLedgerEntry[],
  logRows: PointsLedgerEntry[],
): PointsLedgerEntry[] {
  if (logRows.length === 0) return [];
  const byMember = new Map<string, { ts: number; amt: number }[]>();
  for (const r of ledger) {
    const mid = String(r.member_id ?? '');
    if (!mid) continue;
    const ts = new Date(r.created_at).getTime();
    const amt = Math.abs(r.points_earned);
    if (!byMember.has(mid)) byMember.set(mid, []);
    byMember.get(mid)!.push({ ts, amt });
  }
  return logRows.filter((r) => {
    const mid = String(r.member_id ?? '');
    const ts = new Date(r.created_at).getTime();
    const amt = Math.abs(r.points_earned);
    const existing = byMember.get(mid);
    return !existing?.some(
      (e) => Math.abs(e.ts - ts) <= 2000 && Math.abs(e.amt - amt) < 0.02,
    );
  });
}

// Standalone fetch function — merges points_ledger + points_log for a complete timeline
export async function fetchPointsLedgerFromDb(): Promise<PointsLedgerEntry[]> {
  const [ledgerData, logData] = await Promise.all([
    getPointsLedgerAllOrdered(),
    getPointsLogAllOrdered().catch(() => []),
  ]);
  const ledgerRows = (Array.isArray(ledgerData) ? ledgerData : [])
    .map((row) => normalizePointsLedgerRow(row as Record<string, unknown>));
  const logRows = (Array.isArray(logData) ? logData : [])
    .map((row) => {
      const r = row as Record<string, unknown>;
      const mapped: Record<string, unknown> = {
        ...r,
        amount: r.change ?? r.amount ?? 0,
        points_earned: Number(r.change ?? r.amount ?? 0),
        transaction_type: r.type ?? 'unknown',
        description: r.remark ?? r.description ?? null,
        status: 'issued',
        _source: '__points_log',
      };
      return normalizePointsLedgerRow(mapped);
    });
  const unique = deduplicateLogRows(ledgerRows, logRows);
  return [...ledgerRows, ...unique];
}

export function usePointsLedger() {
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading: loading } = useQuery({
    queryKey: ['points-ledger'],
    queryFn: fetchPointsLedgerFromDb,
    staleTime: STALE_TIME_LIST_MS,
    refetchInterval: 20_000, // 20 秒轮询，确保订单/抽奖/兑换等产生的积分及时展示
    refetchIntervalInBackground: false, // 仅标签页可见时轮询
  });

  // 监听 data-refresh 事件（订单创建、活动赠送等 client 突变会触发 notifyDataMutation）
  useEffect(() => {
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['points-ledger'] });
    const onPointsRefresh = () => invalidate();
    const onDataRefresh = (e: Event) => {
      const d = (e as CustomEvent<{ table?: string }>).detail;
      if (d?.table === 'points_ledger' || d?.table === 'points_log' || d?.table === 'orders' || d?.table === 'activity_gifts') invalidate();
    };
    window.addEventListener('data-refresh:points_ledger', onPointsRefresh);
    window.addEventListener('data-refresh', onDataRefresh);
    return () => {
      window.removeEventListener('data-refresh:points_ledger', onPointsRefresh);
      window.removeEventListener('data-refresh', onDataRefresh);
    };
  }, [queryClient]);

  const addPointsEntry = async (params: {
    member_code: string;
    phone: string;
    order_id: string;
    order_type: 'regular' | 'usdt';
    paid_amount: number;
    currency: CurrencyCode;
    order_points: number;
    creator_id?: string;
  }): Promise<boolean> => {
    const createParams: CreatePointsParams = {
      orderId: params.order_id,
      orderPhoneNumber: params.phone,
      memberCode: params.member_code,
      actualPayment: params.paid_amount,
      currency: params.currency,
      creatorId: params.creator_id,
    };

    const result = await createPointsOnOrderCreate(createParams);
    
    if (result.success) {
      await queryClient.invalidateQueries({ queryKey: ['points-ledger'] });
    }
    
    return result.success;
  };

  const reversePointsForOrder = async (order_id: string): Promise<boolean> => {
    const success = await reversePointsOnOrderCancel(order_id);
    if (success) {
      await queryClient.invalidateQueries({ queryKey: ['points-ledger'] });
    }
    return success;
  };

  const restorePointsForOrder = async (params: {
    order_id: string;
    order_points: number;
    member_code: string;
    phone: string;
    order_type: 'regular' | 'usdt';
    paid_amount: number;
    currency: CurrencyCode;
  }): Promise<boolean> => {
    const restoreParams: CreatePointsParams = {
      orderId: params.order_id,
      orderPhoneNumber: params.phone,
      memberCode: params.member_code,
      actualPayment: params.paid_amount,
      currency: params.currency,
    };

    const result = await restorePointsOnOrderRestore(restoreParams);
    if (result.success) {
      await queryClient.invalidateQueries({ queryKey: ['points-ledger'] });
    }
    return result.success;
  };

  const getMemberPointsBalance = async (member_code: string, lastResetTime?: string | null): Promise<number> => {
    try {
      const resetQ = lastResetTime
        ? `&created_at=gt.${encodeURIComponent(lastResetTime)}`
        : '';

      const byCode = await getPointsLedgerByMemberCodeForBalance(member_code, resetQ);

      let byId: { points_earned?: number | null; amount?: number | null; id?: string }[] = [];
      try {
        const memberRow = await getMembersIdByMemberCode(member_code);
        const memberId = Array.isArray(memberRow) && memberRow[0]?.id;
        if (memberId) {
          byId = await getPointsLedgerByMemberIdForBalance(memberId, resetQ);
        }
      } catch {
        /* fallback to code-only */
      }

      const codeData = Array.isArray(byCode) ? byCode : [];
      const idData = Array.isArray(byId) ? byId : [];
      const seenIds = new Set(codeData.map((e: { id?: string }) => e.id).filter(Boolean));
      const merged = [...codeData];
      for (const entry of idData) {
        if (entry.id && !seenIds.has(entry.id)) {
          merged.push(entry);
          seenIds.add(entry.id);
        }
      }

      const total = merged.reduce(
        (sum: number, e: { points_earned?: number | null; amount?: number | null }) =>
          sum + Number(e.points_earned ?? e.amount ?? 0),
        0
      );
      return total;
    } catch (error) {
      console.error('Failed to calculate member points:', error);
      return 0;
    }
  };

  const getMemberPointsBalanceSync = (member_code: string, lastResetTime?: string | null): number => {
    let filtered = entries.filter(e => 
      e.member_code === member_code && 
      (e.status === 'issued' || e.status === 'reversed')
    );

    if (lastResetTime) {
      const resetDate = new Date(lastResetTime).getTime();
      filtered = filtered.filter(e => new Date(e.created_at).getTime() > resetDate);
    }

    return filtered.reduce((sum, e) => sum + (e.points_earned || 0), 0);
  };

  const getMemberPointsLedger = (member_code: string): PointsLedgerEntry[] => {
    return entries.filter(e => e.member_code === member_code);
  };

  const getOrderPointsLedger = (order_id: string): PointsLedgerEntry[] => {
    return entries.filter(e => e.order_id === order_id);
  };

  const hasOrderEarnedPoints = (order_id: string): boolean => {
    return entries.some(
      e => e.order_id === order_id && 
           e.status === 'issued' &&
           e.points_earned > 0
    );
  };

  const getPointsStatistics = () => {
    const totalIssued = entries
      .filter(e => e.points_earned > 0)
      .reduce((sum, e) => sum + e.points_earned, 0);

    const totalReversed = entries
      .filter(e => e.points_earned < 0)
      .reduce((sum, e) => sum + Math.abs(e.points_earned), 0);

    const netPoints = totalIssued - totalReversed;

    const absLedger = (e: PointsLedgerEntry) =>
      Math.abs(Number(e.points_earned ?? (e as { amount?: number }).amount ?? 0));

    /** 订单等冲正流水，status=reversed（与列表「已回收」一致；不含积分兑换扣减） */
    const totalRecoveredIssued = entries
      .filter(e => e.status === 'reversed' && e.points_earned < 0)
      .reduce((sum, e) => sum + absLedger(e), 0);

    const rt = (e: PointsLedgerEntry) => String(e.reference_type || '').trim().toLowerCase();

    /** 会员端：积分商城（mall_redemption）+ 会员提交的积分兑换单冻结（point_order_freeze） */
    const totalMallRedeemPoints = entries
      .filter(e => {
        const r = rt(e);
        return (r === 'mall_redemption' || r === 'point_order_freeze') && absLedger(e) > 0;
      })
      .reduce((sum, e) => sum + absLedger(e), 0);

    /** 员工后台「积分兑换」活动：reference_type=redemption（redeem_activity_1/2） */
    const totalStaffRedeemPoints = entries
      .filter(e => rt(e) === 'redemption' && absLedger(e) > 0)
      .reduce((sum, e) => sum + absLedger(e), 0);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 86_400_000;
    const isToday = (e: PointsLedgerEntry) => {
      const ts = new Date(e.created_at).getTime();
      return ts >= todayStart && ts < todayEnd;
    };
    const todayEntries = entries.filter(isToday);

    const todayLotteryNet = todayEntries
      .filter(e => e.transaction_type === 'lottery')
      .reduce((s, e) => s + e.points_earned, 0);
    const todayOrderNet = todayEntries
      .filter(e => {
        const txn = e.transaction_type;
        return txn === 'consumption' || txn === 'regular' || txn === 'usdt';
      })
      .reduce((s, e) => s + e.points_earned, 0);
    const todayOtherNet = todayEntries
      .filter(e => {
        const txn = e.transaction_type;
        return txn !== 'lottery' && txn !== 'consumption' && txn !== 'regular' && txn !== 'usdt';
      })
      .reduce((s, e) => s + e.points_earned, 0);
    const todayNetIssued = todayLotteryNet + todayOrderNet + todayOtherNet;

    return {
      totalIssued,
      totalReversed,
      netPoints,
      transactionCount: entries.length,
      totalRecoveredIssued,
      totalMallRedeemPoints,
      totalStaffRedeemPoints,
      todayNetIssued,
      todayLotteryNet,
      todayOrderNet,
      todayOtherNet,
    };
  };

  const getTypeLabel = (type: string): string => {
    return getPointsTypeLabel(type);
  };

  return {
    entries,
    loading,
    addPointsEntry,
    reversePointsForOrder,
    restorePointsForOrder,
    getMemberPointsBalance,
    getMemberPointsBalanceSync,
    getMemberPointsLedger,
    getOrderPointsLedger,
    hasOrderEarnedPoints,
    getPointsStatistics,
    getTypeLabel,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['points-ledger'] }),
  };
}
