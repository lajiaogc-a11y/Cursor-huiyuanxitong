// Points Account Store - 积分账户（使用数据库作为唯一数据源）

import { logOperation } from './auditLogStore';
import { supabase } from '@/integrations/supabase/client';
import { notifyDataMutation } from '@/services/system/dataRefreshManager';

export interface PointsAccount {
  member_code: string;
  phone: string;
  current_points: number;
  points_accrual_start_time: string;
  last_updated: string;
  current_cycle_id: string;
  last_reset_time: string | null;
}

// ============= 内存缓存 =============
let accountsCache: Map<string, PointsAccount> = new Map();
let cacheInitialized = false;

// ============= 缓存初始化 =============
export async function initializePointsAccountCache(): Promise<void> {
  if (cacheInitialized) return;
  
  try {
    const { data, error } = await supabase
      .from('points_accounts')
      .select('*');
    
    if (error) throw error;
    
    (data || []).forEach(row => {
      accountsCache.set(row.member_code, {
        member_code: row.member_code,
        phone: row.phone,
        current_points: row.current_points || 0,
        points_accrual_start_time: row.points_accrual_start_time,
        last_updated: row.last_updated,
        current_cycle_id: row.current_cycle_id || generateCycleId(),
        last_reset_time: row.last_reset_time,
      });
    });
    
    cacheInitialized = true;
    console.log('[PointsAccount] Cache initialized from database');
  } catch (error) {
    console.error('[PointsAccount] Failed to initialize cache:', error);
  }
}

function generateCycleId(): string {
  return `CYCLE_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

// ============= 读取函数 =============

export async function getPointsAccountFromDb(member_code: string): Promise<PointsAccount | null> {
  try {
    const { data, error } = await supabase
      .from('points_accounts')
      .select('*')
      .eq('member_code', member_code)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return {
      member_code: data.member_code,
      phone: data.phone,
      current_points: data.current_points || 0,
      points_accrual_start_time: data.points_accrual_start_time,
      last_updated: data.last_updated,
      current_cycle_id: data.current_cycle_id || generateCycleId(),
      last_reset_time: data.last_reset_time,
    };
  } catch (error) {
    console.error('Failed to get points account:', error);
    return null;
  }
}

export async function getMemberLastResetTimeFromDb(member_code: string): Promise<string | null> {
  const account = await getPointsAccountFromDb(member_code);
  return account?.last_reset_time || null;
}

export function getMemberLastResetTime(member_code: string): string | null {
  if (!cacheInitialized) {
    initializePointsAccountCache();
  }
  return accountsCache.get(member_code)?.last_reset_time || null;
}

// ============= 兑换积分 =============

export interface RedeemPointsResult {
  success: boolean;
  redeemedPoints: number;
  account: PointsAccount | null;
  oldCycleId: string | null;
  newCycleId: string | null;
  resetTime: string | null;
  error_code?: string;
  message?: string;
}

export async function redeemPoints(
  member_code: string, 
  phone: string, 
  currentPoints: number
): Promise<RedeemPointsResult> {
  try {
    if (currentPoints <= 0) {
      return {
        success: false,
        redeemedPoints: 0,
        account: null,
        oldCycleId: null,
        newCycleId: null,
        resetTime: null,
        error_code: "INSUFFICIENT_POINTS",
        message: "当前积分不足",
      };
    }

    const now = new Date().toISOString();
    const newCycleId = generateCycleId();

    const { data: existingAccount } = await supabase
      .from('points_accounts')
      .select('*')
      .eq('member_code', member_code)
      .single();

    const oldCycleId = existingAccount?.current_cycle_id || null;

    if (existingAccount) {
      const { error } = await supabase
        .from('points_accounts')
        .update({
          last_reset_time: now,
          points_accrual_start_time: now,
          current_cycle_id: newCycleId,
          last_updated: now,
          current_points: 0,
        })
        .eq('member_code', member_code);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('points_accounts')
        .insert({
          member_code,
          phone,
          last_reset_time: now,
          points_accrual_start_time: now,
          current_cycle_id: newCycleId,
          last_updated: now,
          current_points: 0,
        });

      if (error) throw error;
    }

    const account: PointsAccount = {
      member_code,
      phone,
      current_points: 0,
      points_accrual_start_time: now,
      last_updated: now,
      current_cycle_id: newCycleId,
      last_reset_time: now,
    };

    accountsCache.set(member_code, account);

    logOperation(
      'activity_gift',
      'update',
      member_code,
      { oldCycleId },
      account,
      `会员${member_code}兑换积分${currentPoints}，积分清零，周期从${oldCycleId}更新为${newCycleId}`
    );

    notifyDataMutation({ table: 'points_accounts', operation: 'UPDATE', source: 'mutation' }).catch(console.error);

    return {
      success: true,
      redeemedPoints: currentPoints,
      account,
      oldCycleId,
      newCycleId,
      resetTime: now,
    };
  } catch (error) {
    console.error('Failed to redeem points:', error);
    return {
      success: false,
      redeemedPoints: 0,
      account: null,
      oldCycleId: null,
      newCycleId: null,
      resetTime: null,
      error_code: "SYSTEM_ERROR",
      message: "系统错误",
    };
  }
}

// ============= 兼容性函数 =============

export function getPointsAccounts(): PointsAccount[] {
  if (!cacheInitialized) {
    initializePointsAccountCache();
  }
  return Array.from(accountsCache.values());
}

export function resetPointsAccountCache(): void {
  accountsCache = new Map();
  cacheInitialized = false;
}

/** @deprecated */
export function addPoints(member_code: string, phone: string, points: number): PointsAccount | null {
  console.warn('addPoints is deprecated. Points are now managed through points_ledger only.');
  return null;
}

/** @deprecated */
export function deductPoints(member_code: string, points: number): PointsAccount | null {
  console.warn('deductPoints is deprecated. Points are now managed through points_ledger only.');
  return null;
}

/** @deprecated */
export function getMemberCurrentPoints(member_code: string): number {
  console.warn('getMemberCurrentPoints is deprecated. Use usePointsLedger.getMemberPointsBalanceSync instead.');
  return 0;
}

/** @deprecated */
export function getMemberPointsAccount(member_code: string, phone: string, createdAt?: string): PointsAccount | null {
  console.warn('getMemberPointsAccount is deprecated. Use getPointsAccountFromDb instead.');
  return null;
}

/** @deprecated */
export function syncPointsFromLedger(member_code: string, phone: string, createdAt: string): PointsAccount | null {
  console.warn('syncPointsFromLedger is deprecated. Points are now always calculated from ledger.');
  return null;
}

/** @deprecated */
export function createPointsAccount(member_code: string, phone: string, createdAt?: string): PointsAccount | null {
  console.warn('createPointsAccount is deprecated.');
  return null;
}

/** @deprecated */
export function getPointsAccrualStartTime(member_code: string): string | null {
  console.warn('getPointsAccrualStartTime is deprecated.');
  return null;
}

/** @deprecated */
export function getMemberCurrentCycleId(member_code: string): string | null {
  console.warn('getMemberCurrentCycleId is deprecated.');
  return null;
}

/** @deprecated */
export function batchClearPoints(member_codes: string[]): number {
  console.warn('batchClearPoints is deprecated.');
  return 0;
}
