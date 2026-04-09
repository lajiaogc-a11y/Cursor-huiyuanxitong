// Points Account Store - 积分账户（使用数据库作为唯一数据源，经表代理）

import { logOperation } from '@/services/audit/auditLogService';
import { apiGet } from '@/api/client';
import { pointsApi } from '@/api/points';
import { notifyDataMutation } from '@/services/system/dataRefreshManager';
import { pickBilingual } from '@/lib/appLocale';

export interface PointsAccount {
  member_code: string;
  phone: string;
  current_points: number;
  points_accrual_start_time: string;
  last_updated: string;
  current_cycle_id: string;
  last_reset_time: string | null;
}

// ============= 进程内内存缓存（非持久化、非跨设备真源；由 DB/API 填充）=============
let accountsCache: Map<string, PointsAccount> = new Map();
let cacheInitialized = false;

function mapRowToAccount(row: Record<string, any>, fallbackMemberCode?: string): PointsAccount {
  const rawPts = row.current_points ?? row.balance;
  const pts = typeof rawPts === 'number' ? rawPts : Number(rawPts) || 0;
  const accrual = row.points_accrual_start_time || row.last_updated || row.updated_at || new Date().toISOString();
  const lastUp = row.last_updated || row.updated_at || accrual;
  return {
    member_code: String(row.member_code || fallbackMemberCode || ''),
    phone: String(row.phone ?? row.phone_number ?? ''),
    current_points: Math.round(pts),
    points_accrual_start_time: accrual,
    last_updated: lastUp,
    current_cycle_id: row.current_cycle_id || generateCycleId(),
    last_reset_time: row.last_reset_time ?? null,
  };
}

async function resolveMemberForPoints(
  member_code: string,
  phone: string
): Promise<{ id: string; phone_number?: string | null; member_code?: string | null } | null> {
  const ph = String(phone || '').trim();
  const code = String(member_code || '').trim();
  if (ph) {
    const byPhone = await apiGet<Record<string, unknown> | null>(
      `/api/data/table/members?phone_number=eq.${encodeURIComponent(ph)}&select=id,phone_number,member_code&single=true`,
    );
    if (byPhone && typeof byPhone.id === 'string') return byPhone as { id: string; phone_number?: string | null; member_code?: string | null };
  }
  if (code) {
    try {
      const byCode = await apiGet<Record<string, unknown> | null>(
        `/api/data/table/members?member_code=eq.${encodeURIComponent(code)}&select=id,phone_number,member_code&single=true`,
      );
      if (byCode && typeof byCode.id === 'string') return byCode as { id: string; phone_number?: string | null; member_code?: string | null };
    } catch {
      /* members 可能尚无 member_code 列 */
    }
  }
  return null;
}

// ============= 缓存初始化 =============
export async function initializePointsAccountCache(): Promise<void> {
  if (cacheInitialized) return;

  try {
    const data = await apiGet<unknown>('/api/data/table/points_accounts?select=*&limit=5000');
    const rows = Array.isArray(data) ? data : [];

    rows.forEach((row: Record<string, any>) => {
      const code = String(row.member_code || '').trim();
      if (code) accountsCache.set(code, mapRowToAccount(row));
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
    const code = String(member_code || '').trim();
    if (!code) return null;

    let row = await apiGet<Record<string, any> | null>(
      `/api/data/table/points_accounts?select=*&member_code=eq.${encodeURIComponent(code)}&single=true`,
    );
    if (row) return mapRowToAccount(row, code);

    let mem: { id: string } | null = null;
    try {
      mem = await apiGet<{ id: string } | null>(
        `/api/data/table/members?member_code=eq.${encodeURIComponent(code)}&select=id&single=true`,
      );
    } catch {
      mem = null;
    }
    if (mem?.id) {
      row = await apiGet<Record<string, any> | null>(
        `/api/data/table/points_accounts?select=*&member_id=eq.${encodeURIComponent(mem.id)}&single=true`,
      );
      if (row) return mapRowToAccount(row, code);
    }

    return null;
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
        message: pickBilingual("当前积分不足", "Insufficient points"),
      };
    }

    const rpcResult = await pointsApi.redeemAllPoints(member_code, phone) as {
      success: boolean;
      error?: string;
      redeemedPoints?: number;
      oldCycleId?: string | null;
      newCycleId?: string | null;
      resetTime?: string | null;
    };

    if (!rpcResult?.success) {
      const errCode = rpcResult?.error || 'REDEEM_FAILED';
      return {
        success: false,
        redeemedPoints: 0,
        account: null,
        oldCycleId: null,
        newCycleId: null,
        resetTime: null,
        error_code: errCode,
        message: pickBilingual(
          errCode === 'MEMBER_NOT_FOUND' ? '未找到会员' : errCode === 'INSUFFICIENT_POINTS' ? '当前积分不足' : '兑换失败',
          errCode === 'MEMBER_NOT_FOUND' ? 'Member not found' : errCode === 'INSUFFICIENT_POINTS' ? 'Insufficient points' : 'Redemption failed',
        ),
      };
    }

    const codeOut = String(member_code || '').trim();
    const now = rpcResult.resetTime || new Date().toISOString();
    const account: PointsAccount = {
      member_code: codeOut,
      phone: String(phone || '').trim(),
      current_points: 0,
      points_accrual_start_time: now,
      last_updated: now,
      current_cycle_id: rpcResult.newCycleId || generateCycleId(),
      last_reset_time: now,
    };

    if (codeOut) accountsCache.set(codeOut, account);

    logOperation(
      'activity_gift',
      'update',
      codeOut || phone,
      { oldCycleId: rpcResult.oldCycleId },
      account,
      pickBilingual(
        `会员${codeOut || phone}兑换积分${rpcResult.redeemedPoints ?? currentPoints}，积分清零`,
        `Member ${codeOut || phone} redeemed ${rpcResult.redeemedPoints ?? currentPoints} points`,
      ),
    );

    notifyDataMutation({ table: 'points_accounts', operation: 'UPDATE', source: 'mutation' }).catch(console.error);

    return {
      success: true,
      redeemedPoints: rpcResult.redeemedPoints ?? currentPoints,
      account,
      oldCycleId: rpcResult.oldCycleId ?? null,
      newCycleId: rpcResult.newCycleId ?? null,
      resetTime: rpcResult.resetTime ?? now,
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
      message: pickBilingual("系统错误", "System error"),
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
