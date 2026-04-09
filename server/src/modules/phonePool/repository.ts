/**
 * PhonePool Repository — 纯数据访问层
 */
import { query, queryOne, execute } from '../../database/index.js';
import { toMySqlDatetime } from '../../lib/shanghaiTime.js';

// ── Schema helpers ───────────────────────────────────────────────────

let _schemaEnsured = false;
export async function ensurePhoneExtractSchema(): Promise<void> {
  if (_schemaEnsured) return;
  _schemaEnsured = true;
  const warn = (label: string, e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unknown table|doesn't exist|1054|42S02/i.test(msg)) return;
    console.warn(`[phonePool] ${label}:`, msg.slice(0, 240));
  };
  try { await execute('ALTER TABLE phone_reservations MODIFY COLUMN reserved_by CHAR(36) NULL'); } catch (e) { warn('phone_reservations.reserved_by nullable', e); }
  try { await execute('ALTER TABLE phone_pool MODIFY COLUMN reserved_by CHAR(36) NULL'); } catch (e) { warn('phone_pool.reserved_by nullable', e); }
}

let _phonePoolColumnCache: 'phone_number' | 'normalized' | null = null;
export async function detectPhonePoolColumn(): Promise<'phone_number' | 'normalized'> {
  if (_phonePoolColumnCache) return _phonePoolColumnCache;
  try {
    const cols = await query<{ Field: string }>(`SHOW COLUMNS FROM phone_pool WHERE Field IN ('phone_number', 'normalized')`);
    const colNames = cols.map(c => c.Field);
    if (colNames.includes('phone_number')) { _phonePoolColumnCache = 'phone_number'; return 'phone_number'; }
    if (colNames.includes('normalized')) { _phonePoolColumnCache = 'normalized'; return 'normalized'; }
  } catch { /* table may not exist */ }
  _phonePoolColumnCache = 'phone_number';
  return 'phone_number';
}

export async function ensurePhonePoolTable(_tenantId: string): Promise<void> {
  try {
    await query('SELECT 1 FROM phone_pool LIMIT 1');
  } catch {
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
      const hasBoth = await query<{ Field: string }>(`SHOW COLUMNS FROM phone_pool WHERE Field = 'phone_number'`);
      if (hasBoth.length === 0) {
        await execute(`ALTER TABLE phone_pool ADD COLUMN phone_number VARCHAR(50) NULL AFTER tenant_id`);
        await execute(`UPDATE phone_pool SET phone_number = normalized WHERE phone_number IS NULL`);
      }
      _phonePoolColumnCache = 'phone_number';
    } catch { /* keep using normalized */ }
  }
  try { const rc = await query<{ Field: string }>(`SHOW COLUMNS FROM phone_pool WHERE Field = 'reserved_by'`); if (rc.length === 0) await execute(`ALTER TABLE phone_pool ADD COLUMN reserved_by CHAR(36) NULL, ADD COLUMN reserved_at DATETIME(3) NULL`); } catch { /* exists */ }
  try { const uc = await query<{ Field: string }>(`SHOW COLUMNS FROM phone_pool WHERE Field = 'updated_at'`); if (uc.length === 0) await execute(`ALTER TABLE phone_pool ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`); } catch { /* exists */ }
  try { const cc = await query<{ Field: string }>(`SHOW COLUMNS FROM phone_pool WHERE Field = 'created_at'`); if (cc.length === 0) await execute(`ALTER TABLE phone_pool ADD COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`); } catch { /* exists */ }
}

// ── Queries ──────────────────────────────────────────────────────────

export async function selectAvailablePhones(tenantId: string, col: string, limit: number) {
  return query<{ id: string; normalized: string }>(
    `SELECT id, ${col} AS normalized FROM phone_pool WHERE tenant_id = ? AND status = 'available' ORDER BY RAND() LIMIT ${limit}`,
    [tenantId],
  );
}

export async function reservePhonesByIds(ids: string[], employeeId: string, now: string): Promise<void> {
  const placeholders = ids.map(() => '?').join(',');
  await execute(`UPDATE phone_pool SET status = 'reserved', reserved_by = ?, reserved_at = ? WHERE id IN (${placeholders})`, [employeeId, now, ...ids]);
}

export async function insertReservationLog(phoneId: string, employeeId: string, action: string, now: string, tenantId: string): Promise<void> {
  await execute(
    `INSERT INTO phone_reservations (id, phone_id, user_id, action, action_at, tenant_id, reserved_by) VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
    [phoneId, employeeId, action, now, tenantId, employeeId],
  );
}

export async function returnPhonesByIds(phoneIds: string[], employeeId: string, tenantId: string): Promise<void> {
  const placeholders = phoneIds.map(() => '?').join(',');
  await execute(
    `UPDATE phone_pool SET status = 'available', reserved_by = NULL, reserved_at = NULL WHERE id IN (${placeholders}) AND reserved_by = ? AND tenant_id = ?`,
    [...phoneIds, employeeId, tenantId],
  );
}

export async function consumePhonesByIds(phoneIds: string[], employeeId: string, tenantId: string): Promise<void> {
  const placeholders = phoneIds.map(() => '?').join(',');
  await execute(
    `UPDATE phone_pool SET status = 'consumed', reserved_by = NULL, reserved_at = NULL WHERE id IN (${placeholders}) AND reserved_by = ? AND tenant_id = ?`,
    [...phoneIds, employeeId, tenantId],
  );
}

export async function countAvailable(tenantId: string): Promise<number> {
  const rows = await query<{ count: number }>(`SELECT COUNT(*) AS count FROM phone_pool WHERE tenant_id = ? AND status = 'available'`, [tenantId]);
  return Number(rows[0]?.count ?? 0);
}

export async function countReserved(tenantId: string): Promise<number> {
  const rows = await query<{ count: number }>(`SELECT COUNT(*) AS count FROM phone_pool WHERE tenant_id = ? AND status = 'reserved'`, [tenantId]);
  return Number(rows[0]?.count ?? 0);
}

export async function countTodayExtracts(employeeId: string, today: string) {
  const rows = await query<{ user_today_extracted: number; user_today_extract_actions: number }>(
    `SELECT GREATEST(0, COALESCE(SUM(CASE WHEN action = 'extract' THEN 1 WHEN action = 'return' THEN -1 ELSE 0 END), 0)) AS user_today_extracted, COALESCE(SUM(CASE WHEN action = 'extract' THEN 1 ELSE 0 END), 0) AS user_today_extract_actions FROM phone_reservations WHERE user_id = ? AND DATE(action_at) = ?`,
    [employeeId, today],
  );
  return rows[0] ?? { user_today_extracted: 0, user_today_extract_actions: 0 };
}

export async function selectReservedPhones(tenantId: string, employeeId: string, col: string, limit: number) {
  return query<{ id: string; normalized: string }>(
    `SELECT id, ${col} AS normalized FROM phone_pool WHERE tenant_id = ? AND status = 'reserved' AND reserved_by = ? ORDER BY reserved_at DESC LIMIT ${limit}`,
    [tenantId, employeeId],
  );
}

export async function deleteAvailablePhones(tenantId: string): Promise<void> {
  await execute(`DELETE FROM phone_pool WHERE tenant_id = ? AND status = 'available'`, [tenantId]);
}

export async function selectExtractSettings(): Promise<{ setting_value: string } | null> {
  return queryOne<{ setting_value: string }>(`SELECT setting_value FROM data_settings WHERE setting_key = 'phone_extract_settings' LIMIT 1`);
}

export async function upsertExtractSettings(val: string): Promise<void> {
  const existing = await queryOne(`SELECT id FROM data_settings WHERE setting_key = 'phone_extract_settings' LIMIT 1`);
  if (existing) {
    await execute(`UPDATE data_settings SET setting_value = ? WHERE setting_key = 'phone_extract_settings'`, [val]);
  } else {
    await execute(`INSERT INTO data_settings (id, setting_key, setting_value) VALUES (UUID(), 'phone_extract_settings', ?)`, [val]);
  }
}

export async function selectExtractRecords(tenantId: string, limit: number) {
  return query<{ action_type: string; operator_name: string; action_count: number; action_at: string }>(
    `SELECT pr.action AS action_type, COALESCE(e.name, e.username, '-') AS operator_name, COUNT(*) AS action_count, MAX(pr.action_at) AS action_at FROM phone_reservations pr LEFT JOIN employees e ON e.id = pr.user_id WHERE pr.tenant_id = ? GROUP BY pr.action, pr.user_id, DATE(pr.action_at) ORDER BY action_at DESC LIMIT ${limit}`,
    [tenantId],
  );
}

export async function insertPhonePoolEntry(tenantId: string, col: 'phone_number' | 'normalized', norm: string): Promise<void> {
  if (col === 'phone_number') {
    await execute(`INSERT INTO phone_pool (id, tenant_id, phone_number, status, created_at, updated_at) VALUES (UUID(), ?, ?, 'available', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`, [tenantId, norm]);
  } else {
    await execute(`INSERT INTO phone_pool (id, tenant_id, normalized, status, created_at, updated_at) VALUES (UUID(), ?, ?, 'available', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`, [tenantId, norm]);
  }
}

export async function showPhonePoolColumns() {
  return query<{ Field: string }>('SHOW COLUMNS FROM phone_pool');
}
