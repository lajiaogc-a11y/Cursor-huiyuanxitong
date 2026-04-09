/**
 * PhonePool Service — 业务编排层
 *
 * 数据访问委托 repository.ts
 */
import { toMySqlDatetime } from '../../lib/shanghaiTime.js';
import * as repo from './repository.js';

export interface ExtractedPhone { id: string; normalized: string; }
export interface PhoneStats { total_available: number; total_reserved: number; user_today_extracted: number; user_today_extract_actions: number; }
export interface ExtractSettings { per_extract_limit: number; per_user_daily_limit: number; }
export interface ExtractRecord { action_type: string; operator_name: string; action_count: number; action_at: string; }

export async function extractPhonesByEmployee(
  employeeId: string, tenantId: string, count: number,
): Promise<{ success: boolean; data?: ExtractedPhone[]; error?: string }> {
  try {
    await repo.ensurePhoneExtractSchema();
    const col = await repo.detectPhonePoolColumn();
    const safeCount = Math.max(1, Math.min(count, 500));
    const rows = await repo.selectAvailablePhones(tenantId, col, safeCount);
    if (rows.length === 0) return { success: true, data: [] };

    const ids = rows.map(r => r.id);
    const now = toMySqlDatetime(new Date());
    await repo.reservePhonesByIds(ids, employeeId, now);
    for (const r of rows) await repo.insertReservationLog(r.id, employeeId, 'extract', now, tenantId);
    return { success: true, data: rows.map(r => ({ id: String(r.id), normalized: r.normalized })) };
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : 'UNKNOWN' }; }
}

export async function returnPhonesByEmployee(
  employeeId: string, tenantId: string, phoneIds: string[],
): Promise<{ success: boolean; data?: string[]; error?: string }> {
  if (!phoneIds?.length) return { success: true, data: [] };
  try {
    await repo.ensurePhoneExtractSchema();
    const now = toMySqlDatetime(new Date());
    await repo.returnPhonesByIds(phoneIds, employeeId, tenantId);
    for (const pid of phoneIds) await repo.insertReservationLog(pid, employeeId, 'return', now, tenantId);
    return { success: true, data: phoneIds };
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : 'UNKNOWN' }; }
}

export async function consumePhonesByEmployee(
  employeeId: string, tenantId: string, phoneIds: string[],
): Promise<{ success: boolean; data?: string[]; error?: string }> {
  if (!phoneIds?.length) return { success: true, data: [] };
  try {
    await repo.ensurePhoneExtractSchema();
    const now = toMySqlDatetime(new Date());
    await repo.consumePhonesByIds(phoneIds, employeeId, tenantId);
    for (const pid of phoneIds) await repo.insertReservationLog(pid, employeeId, 'consume', now, tenantId);
    return { success: true, data: phoneIds };
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : 'UNKNOWN' }; }
}

export async function getPhoneStatsByEmployee(
  employeeId: string, tenantId: string,
): Promise<{ success: boolean; data?: PhoneStats; error?: string }> {
  try {
    const { getShanghaiDateString } = await import('../../lib/shanghaiTime.js');
    const today = getShanghaiDateString();
    const [avail, reserved, todayStats] = await Promise.all([
      repo.countAvailable(tenantId),
      repo.countReserved(tenantId),
      repo.countTodayExtracts(employeeId, today),
    ]);
    return {
      success: true,
      data: {
        total_available: avail,
        total_reserved: reserved,
        user_today_extracted: Number(todayStats.user_today_extracted ?? 0),
        user_today_extract_actions: Number(todayStats.user_today_extract_actions ?? 0),
      },
    };
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : 'UNKNOWN' }; }
}

export async function getMyReservedPhonesByEmployee(
  employeeId: string, tenantId: string, limit = 500,
): Promise<{ success: boolean; data?: ExtractedPhone[]; error?: string }> {
  try {
    const col = await repo.detectPhonePoolColumn();
    const rows = await repo.selectReservedPhones(tenantId, employeeId, col, Math.min(limit, 500));
    return { success: true, data: rows.map(r => ({ id: String(r.id), normalized: r.normalized })) };
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : 'UNKNOWN' }; }
}

export async function checkPhonePoolTableHealth() {
  const expected = ['id', 'tenant_id', 'phone_number', 'status', 'reserved_by', 'reserved_at', 'created_at', 'updated_at'];
  try {
    const cols = await repo.showPhonePoolColumns();
    const colNames = cols.map(c => c.Field);
    const phoneCol = colNames.includes('phone_number') ? 'phone_number' as const : 'normalized' as const;
    const checkList = expected.map(e => e === 'phone_number' ? phoneCol : e);
    return { tableExists: true, columns: colNames, phoneColumn: phoneCol, missingColumns: checkList.filter(c => !colNames.includes(c)) };
  } catch (e) {
    const isTableMissing = e instanceof Error && /ER_NO_SUCH_TABLE|doesn't exist/i.test(e.message);
    if (!isTableMissing) {
      console.error('[PhonePool] health check DB error (not a missing-table):', e);
    }
    return { tableExists: false, columns: [] as string[], phoneColumn: 'phone_number' as const, missingColumns: expected };
  }
}

export async function bulkImportByEmployee(
  employeeId: string, tenantId: string, lines: string[],
): Promise<{ success: boolean; data?: { inserted: number; skipped: number }; error?: string }> {
  try {
    await repo.ensurePhoneExtractSchema();
    await repo.ensurePhonePoolTable(tenantId);
    const col = await repo.detectPhonePoolColumn();
    let inserted = 0, skipped = 0;
    for (const line of lines) {
      const norm = line.trim().replace(/\D/g, '');
      if (!norm || norm.length < 6) { skipped++; continue; }
      try { await repo.insertPhonePoolEntry(tenantId, col, norm); inserted++; } catch (e: unknown) {
        if ((e as { code?: string }).code === 'ER_DUP_ENTRY') skipped++; else throw e;
      }
    }
    return { success: true, data: { inserted, skipped } };
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : 'UNKNOWN' }; }
}

export async function clearPhonePoolByEmployee(
  _employeeId: string, tenantId: string,
): Promise<{ success: boolean; error?: string }> {
  try { await repo.deleteAvailablePhones(tenantId); return { success: true }; } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : 'UNKNOWN' }; }
}

export async function getExtractSettings(): Promise<{ success: boolean; data?: ExtractSettings; error?: string }> {
  try {
    const row = await repo.selectExtractSettings();
    if (row?.setting_value) {
      const val = typeof row.setting_value === 'string' ? JSON.parse(row.setting_value) : row.setting_value;
      return { success: true, data: { per_extract_limit: val.per_extract_limit ?? 100, per_user_daily_limit: val.per_user_daily_limit ?? 5 } };
    }
    return { success: true, data: { per_extract_limit: 100, per_user_daily_limit: 5 } };
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : 'UNKNOWN' }; }
}

export async function getExtractRecords(
  tenantId: string, limit = 100,
): Promise<{ success: boolean; data?: ExtractRecord[]; error?: string }> {
  try {
    const rows = await repo.selectExtractRecords(tenantId, Math.min(limit, 500));
    return {
      success: true,
      data: rows.map(r => ({ action_type: r.action_type ?? 'extract', operator_name: r.operator_name ?? '-', action_count: Number(r.action_count ?? 0), action_at: r.action_at })),
    };
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : 'UNKNOWN' }; }
}

export async function updateExtractSettingsByEmployee(
  _employeeId: string, perExtractLimit?: number | null, perUserDailyLimit?: number | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const val = JSON.stringify({ per_extract_limit: perExtractLimit ?? 100, per_user_daily_limit: perUserDailyLimit ?? 5 });
    await repo.upsertExtractSettings(val);
    return { success: true };
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : 'UNKNOWN' }; }
}
