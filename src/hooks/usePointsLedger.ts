// ============= Points Ledger Hook - react-query Migration =============
// 积分流水 - react-query 缓存确保页面切换不重复请求
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
  created_at: string;
  member_code: string;
  phone_number: string;
  order_id: string | null;
  transaction_type: string;
  actual_payment: number | null;
  currency: string | null;
  exchange_rate: number | null;
  usd_amount: number | null;
  points_multiplier: number | null;
  points_earned: number;
  status: PointsStatus;
  creator_id: string | null;
}

// Standalone fetch function
export async function fetchPointsLedgerFromDb(): Promise<PointsLedgerEntry[]> {
  const { data, error } = await supabase
    .from('points_ledger')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as PointsLedgerEntry[];
}

export function usePointsLedger() {
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading: loading } = useQuery({
    queryKey: ['points-ledger'],
    queryFn: fetchPointsLedgerFromDb,
  });

  // Realtime subscriptions -> invalidate cache
  useEffect(() => {
    const channel = supabase
      .channel('points-ledger-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'points_ledger' }, () => {
        queryClient.invalidateQueries({ queryKey: ['points-ledger'] });
      })
      .subscribe();
    
    const employeesChannel = supabase
      .channel('points-ledger-employees-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'employees' }, () => {
        queryClient.invalidateQueries({ queryKey: ['points-ledger'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(employeesChannel);
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
      let query = supabase
        .from('points_ledger')
        .select('points_earned, status')
        .eq('member_code', member_code)
        .in('status', ['issued', 'reversed']);

      if (lastResetTime) {
        query = query.gt('created_at', lastResetTime);
      }

      const { data, error } = await query;
      if (error) throw error;

      const total = (data || []).reduce((sum, e) => sum + (e.points_earned || 0), 0);
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
    
    return {
      totalIssued,
      totalReversed,
      netPoints,
      transactionCount: entries.length,
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
