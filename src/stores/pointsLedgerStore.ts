// ============= Points Ledger Store - Immutable Audit Ledger =============
// CRITICAL: This is an append-only ledger. NO modifications, NO deletions allowed.
// 使用数据库 points_ledger 表作为唯一数据源
// 注意：此文件提供同步方法供 orderStore 使用，但推荐使用 usePointsLedger hook

import { supabase } from '@/integrations/supabase/client';
import { logOperation } from './auditLogStore';
import { CurrencyCode } from '@/config/currencies';
import { getPointsSettings } from './pointsSettingsStore';
import { 
  createPointsOnOrderCreate, 
  reversePointsOnOrderCancel,
  type CreatePointsParams,
} from '@/services/points/pointsService';

// ============= Types =============

export type PointsSourceType = 'ORDER' | 'REFERRAL';
export type PointsStatus = 'VALID' | 'REVERSED';

export interface PointsLedgerEntry {
  id: string;
  earned_at: string;
  member_code: string;
  phone: string;
  order_id: string;
  order_type: 'regular' | 'usdt';
  paid_amount: number;
  currency: CurrencyCode;
  fx_rate_snapshot: number;
  usd_amount: number;
  points_per_usd_snapshot: number;
  points_earned: number;
  source_type: PointsSourceType;
  status: PointsStatus;
  remark: string;
  transaction_type: string;
  original_entry_id?: string;
}

// ============= 内存缓存 =============
let ledgerCache: PointsLedgerEntry[] = [];
let cacheInitialized = false;

// ============= 缓存初始化 =============
export async function initializePointsLedgerCache(): Promise<void> {
  if (cacheInitialized) return;
  
  try {
    const { data, error } = await supabase
      .from('points_ledger')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);
    
    if (error) throw error;
    
    ledgerCache = (data || []).map(mapDbToEntry);
    cacheInitialized = true;
    console.log('[PointsLedger] Cache initialized from database');
  } catch (error) {
    console.error('[PointsLedger] Failed to initialize cache:', error);
  }
}

function mapDbToEntry(r: any): PointsLedgerEntry {
  // 根据 transaction_type 生成 remark，用于活动数据页面的分类统计
  let remark = '';
  if (r.transaction_type === 'consumption') {
    remark = '消费奖励';
  } else if (r.transaction_type === 'referral_1' || r.transaction_type === 'referral_2') {
    remark = '推荐奖励';
  }
  
  return {
    id: r.id,
    earned_at: r.created_at,
    member_code: r.member_code || '',
    phone: r.phone_number || '',
    order_id: r.order_id || '',
    order_type: r.currency === 'USDT' ? 'usdt' : 'regular',
    paid_amount: r.actual_payment || 0,
    currency: (r.currency || 'NGN') as CurrencyCode,
    fx_rate_snapshot: r.exchange_rate || 1,
    usd_amount: r.usd_amount || 0,
    points_per_usd_snapshot: r.points_multiplier || 1,
    points_earned: r.points_earned || 0,
    source_type: r.transaction_type?.includes('referral') ? 'REFERRAL' : 'ORDER',
    status: r.status === 'reversed' ? 'REVERSED' : 'VALID',
    remark,
    transaction_type: r.transaction_type || '',
  };
}

// ============= 读取函数 =============

export function getPointsLedger(): PointsLedgerEntry[] {
  if (!cacheInitialized) {
    initializePointsLedgerCache();
  }
  return ledgerCache;
}

/**
 * 强制刷新积分流水缓存
 * 用于确保获取最新数据（如订单取消/删除后）
 */
export async function refreshPointsLedgerCache(): Promise<void> {
  cacheInitialized = false;
  await initializePointsLedgerCache();
}

export function resetPointsLedgerCache(): void {
  ledgerCache = [];
  cacheInitialized = false;
}

// ============= 积分操作函数 =============

export interface AppendPointsParams {
  member_code: string;
  phone: string;
  order_id: string;
  order_type: 'regular' | 'usdt';
  paid_amount: number;
  currency: CurrencyCode;
  order_points: number;
}

/**
 * 发放积分（订单创建时调用）
 * 使用新的 pointsService 实现三种积分类型
 */
export async function appendPointsEntry(params: AppendPointsParams): Promise<boolean> {
  const createParams: CreatePointsParams = {
    orderId: params.order_id,
    orderPhoneNumber: params.phone,
    memberCode: params.member_code,
    actualPayment: params.paid_amount,
    currency: params.currency,
  };

  const result = await createPointsOnOrderCreate(createParams);
  
  if (result.success) {
    // 刷新缓存
    await initializePointsLedgerCache();
  }
  
  return result.success;
}

/**
 * 冲正积分（订单取消/删除时调用）
 */
export async function reversePointsForOrder(
  order_id: string,
  order_points: number,
  member_code: string,
  phone: string,
  order_type: 'regular' | 'usdt'
): Promise<boolean> {
  const success = await reversePointsOnOrderCancel(order_id);
  
  if (success) {
    // 刷新缓存
    cacheInitialized = false;
    await initializePointsLedgerCache();
  }
  
  return success;
}

/**
 * 恢复积分（订单恢复时调用）
 */
export async function restorePointsForOrder(
  order_id: string,
  order_points: number,
  member_code: string,
  phone: string,
  order_type: 'regular' | 'usdt'
): Promise<boolean> {
  const settings = getPointsSettings();
  const currency: CurrencyCode = order_type === 'usdt' ? 'USDT' : 'NGN';
  
  const createParams: CreatePointsParams = {
    orderId: order_id,
    orderPhoneNumber: phone,
    memberCode: member_code,
    actualPayment: order_points / (settings.usdToPointsRate || 1), // 反算实付金额
    currency,
  };

  const result = await createPointsOnOrderCreate(createParams);
  
  if (result.success) {
    cacheInitialized = false;
    await initializePointsLedgerCache();
  }
  
  return result.success;
}

// ============= 查询函数 =============

export function getMemberPointsBalance(member_code: string): number {
  const ledger = getPointsLedger();
  return ledger
    .filter(e => e.member_code === member_code && e.status === 'VALID')
    .reduce((sum, e) => sum + e.points_earned, 0);
}

export function getMemberPointsLedger(member_code: string): PointsLedgerEntry[] {
  return getPointsLedger().filter(e => e.member_code === member_code);
}

export function getOrderPointsLedger(order_id: string): PointsLedgerEntry[] {
  return getPointsLedger().filter(e => e.order_id === order_id);
}

export function hasOrderEarnedPoints(order_id: string): boolean {
  const ledger = getPointsLedger();
  return ledger.some(
    e => e.order_id === order_id && 
         e.source_type === 'ORDER' && 
         e.status === 'VALID' &&
         e.points_earned > 0
  );
}

// ============= 统计函数 =============

export interface PointsStatistics {
  totalIssued: number;
  totalReversed: number;
  netPoints: number;
  transactionCount: number;
}

export function getPointsStatistics(): PointsStatistics {
  const ledger = getPointsLedger();
  
  let totalIssued = 0;
  let totalReversed = 0;
  
  ledger.forEach(entry => {
    if (entry.status === 'VALID') {
      if (entry.points_earned > 0) {
        totalIssued += entry.points_earned;
      } else {
        totalReversed += Math.abs(entry.points_earned);
      }
    }
  });
  
  return {
    totalIssued,
    totalReversed,
    netPoints: totalIssued - totalReversed,
    transactionCount: ledger.length,
  };
}

// ============= 推荐积分函数 =============

export interface ReferralPointsParams {
  member_code: string;
  phone: string;
  points: number;
  remark?: string;
}

export async function earnReferralPoints(params: ReferralPointsParams): Promise<PointsLedgerEntry | null> {
  const { member_code, phone, points, remark } = params;
  
  if (points <= 0) {
    return null;
  }
  
  const settings = getPointsSettings();
  
  try {
    const { data, error } = await supabase
      .from('points_ledger')
      .insert({
        member_code,
        phone_number: phone,
        order_id: null,
        transaction_type: 'referral_1',
        actual_payment: null,
        currency: null,
        exchange_rate: null,
        usd_amount: null,
        points_multiplier: null,
        points_earned: points,
        status: 'issued',
      })
      .select()
      .single();
    
    if (error) throw error;
    
    logOperation(
      'activity_gift',
      'create',
      data.id,
      null,
      data,
      `会员${member_code}获得转介绍积分${points}`
    );
    
    cacheInitialized = false;
    await initializePointsLedgerCache();
    
    return mapDbToEntry(data);
  } catch (error) {
    console.error('[PointsLedger] Failed to earn referral points:', error);
    return null;
  }
}
