/**
 * 号码池服务 - 使用 pg 调用 employee_id 版本 RPC
 * 绕过 Supabase auth.uid()，员工 JWT 登录时前端 RPC 会失败
 */
import { queryPg } from '../../database/pg.js';

export interface ExtractedPhone {
  id: number;
  normalized: string;
}

export interface PhoneStats {
  total_available: number;
  total_reserved: number;
  user_today_extracted: number;
  user_today_extract_actions: number;
}

export async function extractPhonesByEmployee(
  employeeId: string,
  tenantId: string,
  count: number
): Promise<{ success: boolean; data?: ExtractedPhone[]; error?: string }> {
  try {
    const rows = await queryPg<{ id: string; normalized: string }>(
      'SELECT * FROM rpc_extract_phones_by_employee($1::uuid, $2::int, $3::uuid)',
      [tenantId, Math.max(1, Math.min(count, 500)), employeeId]
    );
    return {
      success: true,
      data: rows.map((r) => ({ id: parseInt(r.id, 10), normalized: r.normalized })),
    };
  } catch (e: any) {
    const msg = e?.message || '';
    if (msg.includes('has_unreturned_phones')) return { success: false, error: 'HAS_UNRETURNED_PHONES' };
    if (msg.includes('daily_limit_exceeded')) return { success: false, error: 'DAILY_LIMIT_EXCEEDED' };
    if (msg.includes('forbidden_tenant_mismatch')) return { success: false, error: 'FORBIDDEN_TENANT_MISMATCH' };
    if (msg.includes('tenant_id_required')) return { success: false, error: 'TENANT_REQUIRED' };
    if (msg.includes('employee_id_required')) return { success: false, error: 'NOT_AUTHENTICATED' };
    return { success: false, error: msg || 'UNKNOWN' };
  }
}

export async function returnPhonesByEmployee(
  employeeId: string,
  phoneIds: number[]
): Promise<{ success: boolean; data?: number[]; error?: string }> {
  if (!phoneIds?.length) return { success: true, data: [] };
  try {
    const rows = await queryPg<{ returned_id: string }>(
      'SELECT * FROM rpc_return_phones_by_employee($1::bigint[], $2::uuid)',
      [phoneIds, employeeId]
    );
    return { success: true, data: rows.map((r) => parseInt(r.returned_id, 10)) };
  } catch (e: any) {
    const msg = e?.message || '';
    if (msg.includes('employee_id_required')) return { success: false, error: 'NOT_AUTHENTICATED' };
    return { success: false, error: msg || 'UNKNOWN' };
  }
}

export async function consumePhonesByEmployee(
  employeeId: string,
  phoneIds: number[]
): Promise<{ success: boolean; data?: number[]; error?: string }> {
  if (!phoneIds?.length) return { success: true, data: [] };
  try {
    const rows = await queryPg<{ consumed_id: string }>(
      'SELECT * FROM rpc_consume_phones_by_employee($1::bigint[], $2::uuid)',
      [phoneIds, employeeId]
    );
    return { success: true, data: rows.map((r) => parseInt(String(r.consumed_id), 10)) };
  } catch (e: any) {
    const msg = e?.message || '';
    if (msg.includes('employee_id_required')) return { success: false, error: 'NOT_AUTHENTICATED' };
    return { success: false, error: msg || 'UNKNOWN' };
  }
}

export async function getPhoneStatsByEmployee(
  employeeId: string,
  tenantId: string
): Promise<{ success: boolean; data?: PhoneStats; error?: string }> {
  try {
    const [availableRows, reservedRows, todayRows] = await Promise.all([
      queryPg<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM phone_pool
         WHERE tenant_id = $1::uuid AND status = 'available'`,
        [tenantId]
      ),
      queryPg<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM phone_pool
         WHERE tenant_id = $1::uuid AND status = 'reserved'`,
        [tenantId]
      ),
      queryPg<{
        user_today_extracted: number;
        user_today_extract_actions: number;
      }>(
        `SELECT
           GREATEST(
             0,
             COALESCE(SUM(
               CASE
                 WHEN action = 'extract' THEN 1
                 WHEN action = 'return' THEN -1
                 ELSE 0
               END
             ), 0)
           )::int AS user_today_extracted,
           COALESCE(COUNT(DISTINCT CASE WHEN action = 'extract' THEN action_at END), 0)::int AS user_today_extract_actions
         FROM phone_reservations
         WHERE user_id = $1::uuid
           AND action_at::date = now()::date`,
        [employeeId]
      ),
    ]);

    const today = todayRows[0];
    return {
      success: true,
      data: {
        total_available: availableRows[0]?.count ?? 0,
        total_reserved: reservedRows[0]?.count ?? 0,
        user_today_extracted: today?.user_today_extracted ?? 0,
        user_today_extract_actions: today?.user_today_extract_actions ?? 0,
      },
    };
  } catch (e: any) {
    const msg = e?.message || '';
    if (msg.includes('tenant_id_required')) return { success: false, error: 'TENANT_REQUIRED' };
    if (msg.includes('employee_id_required')) return { success: false, error: 'NOT_AUTHENTICATED' };
    return { success: false, error: msg || 'UNKNOWN' };
  }
}

export async function getMyReservedPhonesByEmployee(
  employeeId: string,
  tenantId: string,
  limit = 500
): Promise<{ success: boolean; data?: ExtractedPhone[]; error?: string }> {
  try {
    const rows = await queryPg<{ id: string; normalized: string }>(
      `SELECT id, normalized FROM phone_pool
       WHERE tenant_id = $1::uuid AND status = 'reserved' AND reserved_by = $2::uuid
       ORDER BY reserved_at DESC LIMIT $3`,
      [tenantId, employeeId, limit]
    );
    return {
      success: true,
      data: rows.map((r) => ({ id: parseInt(r.id, 10), normalized: r.normalized })),
    };
  } catch (e: any) {
    return { success: false, error: (e as Error)?.message || 'UNKNOWN' };
  }
}

export interface ExtractSettings {
  per_extract_limit: number;
  per_user_daily_limit: number;
}

export interface ExtractRecord {
  action_type: string;
  operator_name: string;
  action_count: number;
  action_at: string;
}

export async function bulkImportByEmployee(
  employeeId: string,
  tenantId: string,
  lines: string[]
): Promise<{ success: boolean; data?: { inserted: number; skipped: number }; error?: string }> {
  try {
    const rows = await queryPg<{ inserted_count: number; skipped_count: number }>(
      'SELECT * FROM phone_bulk_import_by_employee($1::uuid, $2::text[], $3::uuid)',
      [tenantId, lines, employeeId]
    );
    const row = rows[0];
    if (!row) return { success: false, error: 'NO_DATA' };
    return {
      success: true,
      data: {
        inserted: row.inserted_count ?? 0,
        skipped: row.skipped_count ?? 0,
      },
    };
  } catch (e: any) {
    const msg = e?.message || '';
    if (msg.includes('forbidden_tenant_mismatch')) return { success: false, error: 'FORBIDDEN_TENANT_MISMATCH' };
    if (msg.includes('tenant_id_required')) return { success: false, error: 'TENANT_REQUIRED' };
    if (msg.includes('employee_id_required')) return { success: false, error: 'NOT_AUTHENTICATED' };
    return { success: false, error: msg || 'UNKNOWN' };
  }
}

export async function clearPhonePoolByEmployee(
  employeeId: string,
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await queryPg('SELECT rpc_clear_phone_pool_by_employee($1::uuid, $2::uuid)', [tenantId, employeeId]);
    return { success: true };
  } catch (e: any) {
    const msg = e?.message || '';
    if (msg.includes('forbidden_admin_only')) return { success: false, error: 'FORBIDDEN_ADMIN_ONLY' };
    if (msg.includes('forbidden_tenant_mismatch')) return { success: false, error: 'FORBIDDEN_TENANT_MISMATCH' };
    if (msg.includes('tenant_required')) return { success: false, error: 'TENANT_REQUIRED' };
    if (msg.includes('employee_id_required')) return { success: false, error: 'NOT_AUTHENTICATED' };
    return { success: false, error: msg || 'UNKNOWN' };
  }
}

export async function getExtractSettings(): Promise<{ success: boolean; data?: ExtractSettings; error?: string }> {
  try {
    const rows = await queryPg<{ per_extract_limit: number; per_user_daily_limit: number }>(
      'SELECT * FROM rpc_phone_extract_settings()'
    );
    const row = rows[0];
    if (!row) return { success: false, error: 'NO_DATA' };
    return {
      success: true,
      data: {
        per_extract_limit: row.per_extract_limit ?? 100,
        per_user_daily_limit: row.per_user_daily_limit ?? 5,
      },
    };
  } catch (e: any) {
    return { success: false, error: (e as Error)?.message || 'UNKNOWN' };
  }
}

export async function getExtractRecords(
  tenantId: string,
  limit = 100
): Promise<{ success: boolean; data?: ExtractRecord[]; error?: string }> {
  try {
    const rows = await queryPg<{ action_type: string; operator_name: string; action_count: number; action_at: string }>(
      'SELECT * FROM rpc_phone_extract_records($1::uuid, $2::int)',
      [tenantId, Math.min(limit, 500)]
    );
    return {
      success: true,
      data: rows.map((r) => ({
        action_type: r.action_type as 'extract' | 'return',
        operator_name: r.operator_name ?? '-',
        action_count: r.action_count ?? 0,
        action_at: r.action_at,
      })),
    };
  } catch (e: any) {
    return { success: false, error: (e as Error)?.message || 'UNKNOWN' };
  }
}

export async function updateExtractSettingsByEmployee(
  employeeId: string,
  perExtractLimit?: number | null,
  perUserDailyLimit?: number | null
): Promise<{ success: boolean; error?: string }> {
  try {
    await queryPg('SELECT rpc_update_phone_extract_settings_by_employee($1::int, $2::int, $3::uuid)', [
      perExtractLimit ?? null,
      perUserDailyLimit ?? null,
      employeeId,
    ]);
    return { success: true };
  } catch (e: any) {
    const msg = e?.message || '';
    if (msg.includes('forbidden_admin_only')) return { success: false, error: 'FORBIDDEN_ADMIN_ONLY' };
    if (msg.includes('employee_id_required')) return { success: false, error: 'NOT_AUTHENTICATED' };
    return { success: false, error: msg || 'UNKNOWN' };
  }
}
