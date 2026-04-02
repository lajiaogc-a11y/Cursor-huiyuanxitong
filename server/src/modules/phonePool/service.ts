/**
 * 号码池服务 - MySQL 版本
 */
import { query, queryOne, execute } from '../../database/index.js';
import { toMySqlDatetime } from '../../lib/shanghaiTime.js';

/** 旧库常见：reserved_by NOT NULL 且无默认，归还/消耗 INSERT 流水或 SET NULL 会报 1364 */
let _phoneExtractSchemaEnsured = false;
async function ensurePhoneExtractSchema(): Promise<void> {
  if (_phoneExtractSchemaEnsured) return;
  _phoneExtractSchemaEnsured = true;
  const warn = (label: string, e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unknown table|doesn't exist|1054|42S02/i.test(msg)) return;
    console.warn(`[phonePool] ${label}:`, msg.slice(0, 240));
  };
  try {
    await execute(
      'ALTER TABLE phone_reservations MODIFY COLUMN reserved_by CHAR(36) NULL COMMENT \'操作员工，与 user_id 一致；流水可为空\''
    );
  } catch (e) {
    warn('phone_reservations.reserved_by nullable', e);
  }
  try {
    await execute(
      'ALTER TABLE phone_pool MODIFY COLUMN reserved_by CHAR(36) NULL COMMENT \'当前预留该号码的员工\''
    );
  } catch (e) {
    warn('phone_pool.reserved_by nullable', e);
  }
}

export interface ExtractedPhone {
  id: string;
  normalized: string;
}

export interface PhoneStats {
  total_available: number;
  total_reserved: number;
  user_today_extracted: number;
  user_today_extract_actions: number;
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

export async function extractPhonesByEmployee(
  employeeId: string,
  tenantId: string,
  count: number
): Promise<{ success: boolean; data?: ExtractedPhone[]; error?: string }> {
  try {
    await ensurePhoneExtractSchema();
    const col = await detectPhonePoolColumn();
    const safeCount = Math.max(1, Math.min(count, 500));
    const rows = await query<{ id: string; normalized: string }>(
      `SELECT id, ${col} AS normalized FROM phone_pool
       WHERE tenant_id = ? AND status = 'available'
       ORDER BY RAND() LIMIT ${safeCount}`,
      [tenantId]
    );
    if (rows.length === 0) return { success: true, data: [] };

    const ids = rows.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const now = toMySqlDatetime(new Date());
    await execute(
      `UPDATE phone_pool SET status = 'reserved', reserved_by = ?, reserved_at = ? WHERE id IN (${placeholders})`,
      [employeeId, now, ...ids]
    );

    // 记录提取操作（MySQL 旧表结构 reserved_by NOT NULL，须与 user_id 同为操作员工）
    for (const r of rows) {
      await execute(
        `INSERT INTO phone_reservations (id, phone_id, user_id, action, action_at, tenant_id, reserved_by)
         VALUES (UUID(), ?, ?, 'extract', ?, ?, ?)`,
        [r.id, employeeId, now, tenantId, employeeId]
      );
    }

    return {
      success: true,
      data: rows.map((r) => ({ id: String(r.id), normalized: r.normalized })),
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'UNKNOWN' };
  }
}

export async function returnPhonesByEmployee(
  employeeId: string,
  tenantId: string,
  phoneIds: string[]
): Promise<{ success: boolean; data?: string[]; error?: string }> {
  if (!phoneIds?.length) return { success: true, data: [] };
  try {
    await ensurePhoneExtractSchema();
    const placeholders = phoneIds.map(() => '?').join(',');
    const now = toMySqlDatetime(new Date());
    await execute(
      `UPDATE phone_pool SET status = 'available', reserved_by = NULL, reserved_at = NULL
       WHERE id IN (${placeholders}) AND reserved_by = ?`,
      [...phoneIds, employeeId]
    );
    for (const pid of phoneIds) {
      await execute(
        `INSERT INTO phone_reservations (id, phone_id, user_id, action, action_at, tenant_id, reserved_by)
         VALUES (UUID(), ?, ?, 'return', ?, ?, ?)`,
        [pid, employeeId, now, tenantId, employeeId]
      );
    }
    return { success: true, data: phoneIds };
  } catch (e: any) {
    return { success: false, error: e?.message || 'UNKNOWN' };
  }
}

export async function consumePhonesByEmployee(
  employeeId: string,
  tenantId: string,
  phoneIds: string[]
): Promise<{ success: boolean; data?: string[]; error?: string }> {
  if (!phoneIds?.length) return { success: true, data: [] };
  try {
    await ensurePhoneExtractSchema();
    const placeholders = phoneIds.map(() => '?').join(',');
    const now = toMySqlDatetime(new Date());
    await execute(
      `UPDATE phone_pool SET status = 'consumed', reserved_by = NULL, reserved_at = NULL
       WHERE id IN (${placeholders}) AND reserved_by = ?`,
      [...phoneIds, employeeId]
    );
    for (const pid of phoneIds) {
      await execute(
        `INSERT INTO phone_reservations (id, phone_id, user_id, action, action_at, tenant_id, reserved_by)
         VALUES (UUID(), ?, ?, 'consume', ?, ?, ?)`,
        [pid, employeeId, now, tenantId, employeeId]
      );
    }
    return { success: true, data: phoneIds };
  } catch (e: any) {
    return { success: false, error: e?.message || 'UNKNOWN' };
  }
}

export async function getPhoneStatsByEmployee(
  employeeId: string,
  tenantId: string
): Promise<{ success: boolean; data?: PhoneStats; error?: string }> {
  try {
    const { getShanghaiDateString } = await import('../../lib/shanghaiTime.js');
    const today = getShanghaiDateString();
    const [availableRows, reservedRows, todayRows] = await Promise.all([
      query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM phone_pool WHERE tenant_id = ? AND status = 'available'`,
        [tenantId]
      ),
      query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM phone_pool WHERE tenant_id = ? AND status = 'reserved'`,
        [tenantId]
      ),
      query<{ user_today_extracted: number; user_today_extract_actions: number }>(
        `SELECT
           GREATEST(0, COALESCE(SUM(
             CASE WHEN action = 'extract' THEN 1 WHEN action = 'return' THEN -1 ELSE 0 END
           ), 0)) AS user_today_extracted,
           COALESCE(SUM(CASE WHEN action = 'extract' THEN 1 ELSE 0 END), 0) AS user_today_extract_actions
         FROM phone_reservations
         WHERE user_id = ? AND DATE(action_at) = ?`,
        [employeeId, today]
      ),
    ]);

    const t = todayRows[0];
    return {
      success: true,
      data: {
        total_available: Number(availableRows[0]?.count ?? 0),
        total_reserved: Number(reservedRows[0]?.count ?? 0),
        user_today_extracted: Number(t?.user_today_extracted ?? 0),
        user_today_extract_actions: Number(t?.user_today_extract_actions ?? 0),
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'UNKNOWN' };
  }
}

export async function getMyReservedPhonesByEmployee(
  employeeId: string,
  tenantId: string,
  limit = 500
): Promise<{ success: boolean; data?: ExtractedPhone[]; error?: string }> {
  try {
    const col = await detectPhonePoolColumn();
    const safeLimit = Math.min(limit, 500);
    const rows = await query<{ id: string; normalized: string }>(
      `SELECT id, ${col} AS normalized FROM phone_pool
       WHERE tenant_id = ? AND status = 'reserved' AND reserved_by = ?
       ORDER BY reserved_at DESC LIMIT ${safeLimit}`,
      [tenantId, employeeId]
    );
    return {
      success: true,
      data: rows.map((r) => ({ id: String(r.id), normalized: r.normalized })),
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'UNKNOWN' };
  }
}

let _phonePoolColumnCache: 'phone_number' | 'normalized' | null = null;

async function detectPhonePoolColumn(): Promise<'phone_number' | 'normalized'> {
  if (_phonePoolColumnCache) return _phonePoolColumnCache;
  try {
    const cols = await query<{ Field: string }>(
      `SHOW COLUMNS FROM phone_pool WHERE Field IN ('phone_number', 'normalized')`
    );
    const colNames = cols.map(c => c.Field);
    if (colNames.includes('phone_number')) {
      _phonePoolColumnCache = 'phone_number';
      return 'phone_number';
    }
    if (colNames.includes('normalized')) {
      _phonePoolColumnCache = 'normalized';
      return 'normalized';
    }
  } catch (_) { /* table may not exist */ }
  _phonePoolColumnCache = 'phone_number';
  return 'phone_number';
}

async function ensurePhonePoolTable(tenantId: string): Promise<void> {
  try {
    await query('SELECT 1 FROM phone_pool LIMIT 1');
  } catch (_) {
    await execute(`
      CREATE TABLE IF NOT EXISTS phone_pool (
        id CHAR(36) NOT NULL PRIMARY KEY,
        tenant_id CHAR(36) NOT NULL,
        phone_number VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'available',
        assigned_member_id CHAR(36) NULL,
        reserved_by CHAR(36) NULL,
        reserved_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY uk_phone_pool_number (tenant_id, phone_number),
        KEY idx_phone_pool_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    _phonePoolColumnCache = 'phone_number';
    return;
  }

  const col = await detectPhonePoolColumn();
  if (col === 'normalized') {
    try {
      const hasBoth = await query<{ Field: string }>(
        `SHOW COLUMNS FROM phone_pool WHERE Field = 'phone_number'`
      );
      if (hasBoth.length === 0) {
        await execute(
          `ALTER TABLE phone_pool ADD COLUMN phone_number VARCHAR(50) NULL AFTER tenant_id`
        );
        await execute(
          `UPDATE phone_pool SET phone_number = normalized WHERE phone_number IS NULL`
        );
      }
      _phonePoolColumnCache = 'phone_number';
    } catch (_) { /* keep using normalized */ }
  }

  try {
    const reservedCols = await query<{ Field: string }>(
      `SHOW COLUMNS FROM phone_pool WHERE Field = 'reserved_by'`
    );
    if (reservedCols.length === 0) {
      await execute(
        `ALTER TABLE phone_pool ADD COLUMN reserved_by CHAR(36) NULL, ADD COLUMN reserved_at DATETIME(3) NULL`
      );
    }
  } catch { /* column may already exist */ }

  try {
    const updatedCols = await query<{ Field: string }>(
      `SHOW COLUMNS FROM phone_pool WHERE Field = 'updated_at'`
    );
    if (updatedCols.length === 0) {
      await execute(
        `ALTER TABLE phone_pool ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`
      );
    }
  } catch { /* column may already exist */ }

  try {
    const createdCols = await query<{ Field: string }>(
      `SHOW COLUMNS FROM phone_pool WHERE Field = 'created_at'`
    );
    if (createdCols.length === 0) {
      await execute(
        `ALTER TABLE phone_pool ADD COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`
      );
    }
  } catch { /* column may already exist */ }
}

export async function checkPhonePoolTableHealth(): Promise<{
  tableExists: boolean;
  columns: string[];
  phoneColumn: 'phone_number' | 'normalized';
  missingColumns: string[];
}> {
  const expected = ['id', 'tenant_id', 'phone_number', 'status', 'reserved_by', 'reserved_at', 'created_at', 'updated_at'];
  try {
    const cols = await query<{ Field: string }>('SHOW COLUMNS FROM phone_pool');
    const colNames = cols.map(c => c.Field);
    const phoneCol = colNames.includes('phone_number') ? 'phone_number' as const : 'normalized' as const;
    const checkList = expected.map(e => e === 'phone_number' ? phoneCol : e);
    const missing = checkList.filter(c => !colNames.includes(c));
    return { tableExists: true, columns: colNames, phoneColumn: phoneCol, missingColumns: missing };
  } catch (_) {
    return { tableExists: false, columns: [], phoneColumn: 'phone_number', missingColumns: expected };
  }
}

export async function bulkImportByEmployee(
  employeeId: string,
  tenantId: string,
  lines: string[]
): Promise<{ success: boolean; data?: { inserted: number; skipped: number }; error?: string }> {
  try {
    await ensurePhoneExtractSchema();
    await ensurePhonePoolTable(tenantId);
    const col = await detectPhonePoolColumn();

    let inserted = 0;
    let skipped = 0;
    for (const line of lines) {
      const norm = line.trim().replace(/\D/g, '');
      if (!norm || norm.length < 6) {
        skipped++;
        continue;
      }
      try {
        if (col === 'phone_number') {
          await execute(
            `INSERT INTO phone_pool (id, tenant_id, phone_number, status, created_at, updated_at)
             VALUES (UUID(), ?, ?, 'available', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
            [tenantId, norm]
          );
        } else {
          await execute(
            `INSERT INTO phone_pool (id, tenant_id, normalized, status, created_at, updated_at)
             VALUES (UUID(), ?, ?, 'available', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
            [tenantId, norm]
          );
        }
        inserted++;
      } catch (e: any) {
        if (e.code === 'ER_DUP_ENTRY') skipped++;
        else throw e;
      }
    }
    return { success: true, data: { inserted, skipped } };
  } catch (e: any) {
    return { success: false, error: e?.message || 'UNKNOWN' };
  }
}

export async function clearPhonePoolByEmployee(
  employeeId: string,
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await execute(`DELETE FROM phone_pool WHERE tenant_id = ? AND status = 'available'`, [tenantId]);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'UNKNOWN' };
  }
}

export async function getExtractSettings(): Promise<{ success: boolean; data?: ExtractSettings; error?: string }> {
  try {
    const row = await queryOne<{ setting_value: string }>(
      `SELECT setting_value FROM data_settings WHERE setting_key = 'phone_extract_settings' LIMIT 1`
    );
    if (row?.setting_value) {
      const val = typeof row.setting_value === 'string' ? JSON.parse(row.setting_value) : row.setting_value;
      return {
        success: true,
        data: {
          per_extract_limit: val.per_extract_limit ?? 100,
          per_user_daily_limit: val.per_user_daily_limit ?? 5,
        },
      };
    }
    return { success: true, data: { per_extract_limit: 100, per_user_daily_limit: 5 } };
  } catch (e: any) {
    return { success: false, error: e?.message || 'UNKNOWN' };
  }
}

export async function getExtractRecords(
  tenantId: string,
  limit = 100
): Promise<{ success: boolean; data?: ExtractRecord[]; error?: string }> {
  try {
    const safeLimit = Math.min(limit, 500);
    const rows = await query<{ action_type: string; operator_name: string; action_count: number; action_at: string }>(
      `SELECT pr.action AS action_type, COALESCE(e.name, e.username, '-') AS operator_name,
              COUNT(*) AS action_count, MAX(pr.action_at) AS action_at
       FROM phone_reservations pr
       LEFT JOIN employees e ON e.id = pr.user_id
       WHERE pr.tenant_id = ?
       GROUP BY pr.action, pr.user_id, DATE(pr.action_at)
       ORDER BY action_at DESC
       LIMIT ${safeLimit}`,
      [tenantId]
    );
    return {
      success: true,
      data: rows.map(r => ({
        action_type: r.action_type ?? 'extract',
        operator_name: r.operator_name ?? '-',
        action_count: Number(r.action_count ?? 0),
        action_at: r.action_at,
      })),
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'UNKNOWN' };
  }
}

export async function updateExtractSettingsByEmployee(
  _employeeId: string,
  perExtractLimit?: number | null,
  perUserDailyLimit?: number | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const val = JSON.stringify({
      per_extract_limit: perExtractLimit ?? 100,
      per_user_daily_limit: perUserDailyLimit ?? 5,
    });
    const existing = await queryOne(
      `SELECT id FROM data_settings WHERE setting_key = 'phone_extract_settings' LIMIT 1`
    );
    if (existing) {
      await execute(
        `UPDATE data_settings SET setting_value = ? WHERE setting_key = 'phone_extract_settings'`,
        [val]
      );
    } else {
      await execute(
        `INSERT INTO data_settings (id, setting_key, setting_value) VALUES (UUID(), 'phone_extract_settings', ?)`,
        [val]
      );
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'UNKNOWN' };
  }
}
