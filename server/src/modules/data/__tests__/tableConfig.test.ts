/**
 * tableConfig.ts 安全功能测试
 *
 * 重点验证：
 * 1. SQL 注入防止（ORDER BY / SELECT 列名校验）
 * 2. 表白名单分级访问控制
 * 3. Supabase 风格过滤参数解析
 * 4. 列名别名映射
 * 5. ISO 时间格式转换
 */
import { describe, it, expect } from 'vitest';
import {
  SAFE_COLUMN_RE,
  TABLE_TIERS,
  getTableTier,
  isTableProxyAllowed,
  mapColumnName,
  getReverseAliasMap,
  mapBodyColumns,
  toMySqlDatetime,
  parseFilters,
  parseOrder,
} from '../tableConfig.js';

// ─── SAFE_COLUMN_RE ─────────────────────────────────────────────────────────

describe('SAFE_COLUMN_RE — 列名安全校验', () => {
  it('allows valid column names', () => {
    expect(SAFE_COLUMN_RE.test('id')).toBe(true);
    expect(SAFE_COLUMN_RE.test('created_at')).toBe(true);
    expect(SAFE_COLUMN_RE.test('tenant_id')).toBe(true);
    expect(SAFE_COLUMN_RE.test('_private')).toBe(true);
    expect(SAFE_COLUMN_RE.test('col123')).toBe(true);
    expect(SAFE_COLUMN_RE.test('CamelCase')).toBe(true);
  });

  it('blocks SQL injection attempts in column names', () => {
    expect(SAFE_COLUMN_RE.test('id; DROP TABLE members--')).toBe(false);
    expect(SAFE_COLUMN_RE.test('1col')).toBe(false); // starts with digit
    expect(SAFE_COLUMN_RE.test('col name')).toBe(false); // space
    expect(SAFE_COLUMN_RE.test('col.name')).toBe(false); // dot
    expect(SAFE_COLUMN_RE.test('col-name')).toBe(false); // hyphen
    expect(SAFE_COLUMN_RE.test("col'name")).toBe(false); // single quote
    expect(SAFE_COLUMN_RE.test('col"name')).toBe(false); // double quote
    expect(SAFE_COLUMN_RE.test('')).toBe(false); // empty
    expect(SAFE_COLUMN_RE.test('col/*comment*/')).toBe(false); // comment injection
    expect(SAFE_COLUMN_RE.test('SLEEP(5)')).toBe(false); // time-based injection
  });
});

// ─── parseOrder ──────────────────────────────────────────────────────────────

describe('parseOrder — ORDER BY 注入防止', () => {
  it('parses valid ascending order', () => {
    expect(parseOrder('created_at.asc')).toBe('ORDER BY `created_at` ASC');
  });

  it('parses valid descending order', () => {
    expect(parseOrder('amount.desc')).toBe('ORDER BY `amount` DESC');
  });

  it('parses multiple columns', () => {
    const result = parseOrder('created_at.desc,id.asc');
    expect(result).toBe('ORDER BY `created_at` DESC, `id` ASC');
  });

  it('returns empty string when orderStr is undefined', () => {
    expect(parseOrder(undefined)).toBe('');
    expect(parseOrder('')).toBe('');
  });

  it('silently drops SQL injection in column name position', () => {
    // Semicolon BEFORE first dot → part of column name → fails SAFE_COLUMN_RE → dropped
    expect(parseOrder('id; DROP TABLE members--')).toBe('');
    // starts with digit → fails SAFE_COLUMN_RE
    expect(parseOrder('1=1.asc')).toBe('');
    // SLEEP(5) fails SAFE_COLUMN_RE (parentheses not allowed)
    expect(parseOrder('col.desc,SLEEP(5).asc')).toBe('ORDER BY `col` DESC');
  });

  it('neutralises injection in direction position (produces safe SQL)', () => {
    // Semicolon AFTER the dot → direction string; direction is NEVER interpolated,
    // always hardcoded as ASC or DESC, so the injection is completely neutralised.
    const result = parseOrder("id.asc; DELETE FROM members");
    // Column `id` passes validation → safe backtick-quoted output
    expect(result).toBe('ORDER BY `id` ASC');
    // Verify the injection string is NOT present anywhere in the output
    expect(result).not.toContain('DELETE');
    expect(result).not.toContain('DROP');
    expect(result).not.toContain(';');
  });

  it('defaults to ASC for unknown direction', () => {
    const result = parseOrder('name.unknown');
    expect(result).toBe('ORDER BY `name` ASC');
  });

  it('applies column alias mapping', () => {
    const result = parseOrder('current_points.desc', 'points_accounts');
    expect(result).toBe('ORDER BY `balance` DESC');
  });

  it('drops injection in aliased column name too', () => {
    const result = parseOrder('DROP_TABLE.asc', 'members');
    // DROP_TABLE passes SAFE_COLUMN_RE (only letters+underscore), no alias → allowed
    // This confirms the regex is the main defense mechanism
    expect(result).toBe('ORDER BY `DROP_TABLE` ASC');
  });
});

// ─── parseFilters ─────────────────────────────────────────────────────────────

describe('parseFilters — Supabase 风格过滤解析', () => {
  it('parses eq filter', () => {
    const { where, values } = parseFilters({ status: 'eq.active' });
    expect(where).toBe('WHERE `status` = ?');
    expect(values).toEqual(['active']);
  });

  it('parses neq filter', () => {
    const { where, values } = parseFilters({ status: 'neq.deleted' });
    expect(where).toBe('WHERE `status` != ?');
    expect(values).toEqual(['deleted']);
  });

  it('parses gt/gte/lt/lte filters', () => {
    const gt = parseFilters({ amount: 'gt.100' });
    expect(gt.where).toBe('WHERE `amount` > ?');
    expect(gt.values).toEqual(['100']);

    const gte = parseFilters({ amount: 'gte.100' });
    expect(gte.where).toBe('WHERE `amount` >= ?');

    const lt = parseFilters({ amount: 'lt.200' });
    expect(lt.where).toBe('WHERE `amount` < ?');

    const lte = parseFilters({ amount: 'lte.200' });
    expect(lte.where).toBe('WHERE `amount` <= ?');
  });

  it('parses like / ilike filters', () => {
    const like = parseFilters({ name: 'like.%john%' });
    expect(like.where).toBe('WHERE `name` LIKE ?');
    expect(like.values).toEqual(['%john%']);

    const ilike = parseFilters({ name: 'ilike.%JOHN%' });
    expect(ilike.where).toContain('LOWER');
  });

  it('parses in filter', () => {
    const { where, values } = parseFilters({ status: 'in.(active,pending)' });
    expect(where).toBe('WHERE `status` IN (?,?)');
    expect(values).toEqual(['active', 'pending']);
  });

  it('parses is.null filter', () => {
    const { where } = parseFilters({ deleted_at: 'is.null' });
    expect(where).toBe('WHERE `deleted_at` IS NULL');
  });

  it('parses is.true / is.false filters', () => {
    expect(parseFilters({ active: 'is.true' }).where).toBe('WHERE `active` = 1');
    expect(parseFilters({ active: 'is.false' }).where).toBe('WHERE `active` = 0');
  });

  it('parses not.eq filter', () => {
    const { where, values } = parseFilters({ status: 'not.eq.deleted' });
    expect(where).toBe('WHERE `status` != ?');
    expect(values).toEqual(['deleted']);
  });

  it('parses not.is.null filter', () => {
    const { where } = parseFilters({ deleted_at: 'not.is.null' });
    expect(where).toBe('WHERE `deleted_at` IS NOT NULL');
  });

  it('parses boolean eq correctly', () => {
    const trueFilter = parseFilters({ active: 'eq.true' });
    expect(trueFilter.values).toEqual([1]);

    const falseFilter = parseFilters({ active: 'eq.false' });
    expect(falseFilter.values).toEqual([0]);
  });

  it('parses OR filter', () => {
    const { where, values } = parseFilters({ or: 'status.eq.active,status.eq.pending' });
    expect(where).toContain('OR');
    expect(values).toContain('active');
    expect(values).toContain('pending');
  });

  it('skips reserved keys', () => {
    const { where } = parseFilters({ select: 'id,name', order: 'id.asc', limit: '10', offset: '0' });
    expect(where).toBe('');
  });

  it('returns empty WHERE for no filters', () => {
    const { where, values } = parseFilters({});
    expect(where).toBe('');
    expect(values).toHaveLength(0);
  });

  it('converts ISO datetime values to Shanghai timezone', () => {
    const { values } = parseFilters({ created_at: 'gt.2026-01-01T00:00:00.000Z' });
    // 00:00 UTC → 08:00 UTC+8 (Asia/Shanghai)
    expect(values[0]).toBe('2026-01-01 08:00:00');
  });

  it('applies table column alias mapping', () => {
    const { where } = parseFilters({ current_points: 'gt.100' }, 'points_accounts');
    expect(where).toBe('WHERE `balance` > ?');
  });
});

// ─── getTableTier / isTableProxyAllowed ──────────────────────────────────────

describe('getTableTier — 表访问分级', () => {
  it('returns standard for normal business tables', () => {
    expect(getTableTier('members')).toBe('standard');
    expect(getTableTier('orders')).toBe('standard');
    expect(getTableTier('points_ledger')).toBe('standard');
  });

  it('returns read_only for log/audit tables', () => {
    expect(getTableTier('audit_records')).toBe('read_only');
    expect(getTableTier('employee_login_logs')).toBe('read_only');
    expect(getTableTier('member_operation_logs')).toBe('read_only');
    expect(getTableTier('operation_logs')).toBe('read_only');
    expect(getTableTier('lottery_logs')).toBe('read_only');
  });

  it('returns admin_only for sensitive tables', () => {
    expect(getTableTier('tenants')).toBe('admin_only');
    expect(getTableTier('api_keys')).toBe('admin_only');
    expect(getTableTier('role_permissions')).toBe('admin_only');
    expect(getTableTier('employee_permissions')).toBe('admin_only');
  });

  it('returns null for unknown tables', () => {
    expect(getTableTier('__unknown__')).toBeNull();
    expect(getTableTier('users')).toBeNull();
    expect(getTableTier('')).toBeNull();
  });
});

describe('isTableProxyAllowed — 白名单校验', () => {
  it('allows all registered tables', () => {
    expect(isTableProxyAllowed('members')).toBe(true);
    expect(isTableProxyAllowed('audit_records')).toBe(true);
    expect(isTableProxyAllowed('tenants')).toBe(true);
  });

  it('rejects unregistered tables (SQL injection targets)', () => {
    expect(isTableProxyAllowed('')).toBe(false);
    expect(isTableProxyAllowed('users')).toBe(false);
    expect(isTableProxyAllowed('information_schema')).toBe(false);
    expect(isTableProxyAllowed('mysql.user')).toBe(false);
    expect(isTableProxyAllowed("members'; DROP TABLE members--")).toBe(false);
  });

  it('total whitelist count is reasonable', () => {
    expect(TABLE_TIERS.size).toBeGreaterThan(30);
    expect(TABLE_TIERS.size).toBeLessThan(200);
  });
});

// ─── mapColumnName / getReverseAliasMap / mapBodyColumns ─────────────────────

describe('mapColumnName — 列名别名映射', () => {
  it('maps frontend alias to DB column', () => {
    expect(mapColumnName('points_accounts', 'current_points')).toBe('balance');
    expect(mapColumnName('user_data_store', 'data_key')).toBe('store_key');
    expect(mapColumnName('notifications', 'recipient_id')).toBe('user_id');
    expect(mapColumnName('notifications', 'message')).toBe('content');
    expect(mapColumnName('error_reports', 'metadata')).toBe('context');
  });

  it('returns original column name when no alias exists', () => {
    expect(mapColumnName('members', 'id')).toBe('id');
    expect(mapColumnName('orders', 'status')).toBe('status');
    expect(mapColumnName('unknown_table', 'any_col')).toBe('any_col');
  });
});

describe('getReverseAliasMap — 反向列名映射', () => {
  it('returns reverse mapping for points_accounts', () => {
    const map = getReverseAliasMap('points_accounts');
    expect(map).not.toBeNull();
    expect(map!['balance']).toBe('current_points');
  });

  it('returns reverse mapping for notifications', () => {
    const map = getReverseAliasMap('notifications');
    expect(map!['user_id']).toBe('recipient_id');
    expect(map!['content']).toBe('message');
  });

  it('returns null for tables without alias', () => {
    expect(getReverseAliasMap('members')).toBeNull();
  });

  it('orders: reverse map card_type → order_type', () => {
    expect(getReverseAliasMap('orders')).toEqual({ card_type: 'order_type' });
  });
});

describe('mapBodyColumns — 请求体列名映射', () => {
  it('maps body columns for points_accounts', () => {
    const result = mapBodyColumns('points_accounts', { current_points: 100, tenant_id: 'abc' });
    expect(result).toEqual({ balance: 100, tenant_id: 'abc' });
  });

  it('returns unchanged body when no alias exists', () => {
    const body = { id: '1', status: 'active' };
    expect(mapBodyColumns('members', body)).toEqual(body);
  });

  it('maps orders order_type → card_type', () => {
    expect(
      mapBodyColumns('orders', { order_type: 'uuid-card', vendor_id: 'v1' }),
    ).toEqual({ card_type: 'uuid-card', vendor_id: 'v1' });
  });
});

// ─── toMySqlDatetime ──────────────────────────────────────────────────────────

describe('toMySqlDatetime — ISO → Asia/Shanghai MySQL datetime', () => {
  it('converts UTC ISO string to Shanghai timezone', () => {
    // 03:53 UTC → 11:53 UTC+8
    expect(toMySqlDatetime('2026-03-23T03:53:51.653Z')).toBe('2026-03-23 11:53:51.653');
  });

  it('converts ISO string with +08:00 offset (same timezone, no shift)', () => {
    // +08:00 is already Shanghai time
    const result = toMySqlDatetime('2026-03-23T03:53:51.000+08:00');
    expect(result).toBe('2026-03-23 03:53:51');
  });

  it('converts UTC midnight to Shanghai 08:00', () => {
    expect(toMySqlDatetime('2026-01-01T00:00:00Z')).toBe('2026-01-01 08:00:00');
  });

  it('leaves non-ISO strings unchanged', () => {
    expect(toMySqlDatetime('active')).toBe('active');
    expect(toMySqlDatetime('2026-01-01')).toBe('2026-01-01');
    expect(toMySqlDatetime(123)).toBe(123);
    expect(toMySqlDatetime(null)).toBe(null);
  });
});
