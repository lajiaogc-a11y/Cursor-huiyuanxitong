/**
 * Table proxy configuration and utility functions
 * Extracted from tableProxy.ts to reduce file size and improve maintainability
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { resolveAccessScope } from '../../security/accessScope.js';

// ─── TableProxy 白名单分级 ───────────────────────────────────────────
// read_only      — 仅允许 SELECT；日志/归档表，前端不应写入
// audit_workflow — 仅 audit_records：员工可 INSERT 待审、UPDATE 审批字段，禁止 DELETE（防篡改审计链）
// standard       — SELECT + INSERT + UPDATE + DELETE；普通业务表
// admin_only     — 仅 admin / super_admin / platform_super_admin 可访问全部操作
export type TableTier = 'read_only' | 'audit_workflow' | 'standard' | 'admin_only';

export const TABLE_TIERS = new Map<string, TableTier>([
  // ── admin_only: 高敏感表 ──
  ['tenants',                  'admin_only'],
  ['api_keys',                 'admin_only'],
  ['employee_session_controls','admin_only'],
  ['employee_devices',       'admin_only'],
  ['employee_login_lockout',   'admin_only'],
  ['tenant_migration_jobs',    'admin_only'],
  ['tenant_migration_rollbacks','admin_only'],
  ['role_permissions',         'admin_only'],
  ['employee_permissions',     'admin_only'],

  // ── read_only: 日志/审计/归档/版本历史 ──
  ['audit_records',                   'audit_workflow'],
  ['employee_login_logs',             'read_only'],
  ['system_logs',                     'read_only'],
  ['api_request_logs',                'read_only'],
  ['permission_change_logs',          'read_only'],
  ['permission_versions',             'read_only'],
  ['operation_logs',                  'read_only'],
  ['employee_name_history',           'read_only'],
  ['archived_orders',                 'read_only'],
  ['archived_operation_logs',         'read_only'],
  ['archived_points_ledger',          'read_only'],
  ['archive_runs',                    'read_only'],
  ['webhook_delivery_logs',           'read_only'],
  ['data_backups',                    'read_only'],
  ['member_portal_settings_versions', 'read_only'],
  ['lottery_logs',                    'read_only'],
  ['points_log',                      'read_only'],
  ['member_operation_logs',           'read_only'],
  ['risk_events',                     'read_only'],
  ['risk_scores',                     'read_only'],

  // ── standard: 普通业务表 ──
  ['members',              'standard'],
  ['employees',            'standard'],
  ['orders',               'standard'],
  ['gift_cards',           'standard'],
  ['cards',                'standard'],
  ['vendors',              'standard'],
  ['payment_providers',    'standard'],
  ['points_accounts',      'standard'],
  ['points_ledger',        'standard'],
  ['announcements',        'standard'],
  ['site_messages',        'standard'],
  ['spins',                'standard'],
  ['spin_credits',         'standard'],
  ['spin_quotas',          'standard'],
  ['check_ins',            'standard'],
  ['member_invites',       'standard'],
  ['member_transactions',  'standard'],
  ['member_spin_wheel_prizes','standard'],
  ['member_points_mall_items','standard'],
  ['redemptions',          'standard'],
  ['lottery_prizes',       'standard'],
  ['lottery_settings',     'standard'],
  ['uploaded_images',      'read_only'],
  ['otp_verifications',    'standard'],
  ['referral_relations',   'standard'],
  ['profiles',             'standard'],
  ['knowledge_categories', 'standard'],
  ['knowledge_articles',   'standard'],
  ['knowledge_read_status','standard'],
  ['webhooks',             'standard'],
  ['webhook_event_queue',  'standard'],
  ['phone_pool',           'standard'],
  ['phone_reservations',   'standard'],
  ['activity_gifts',       'standard'],
  ['activity_settings',    'standard'],
  ['activity_types',       'standard'],
  ['activity_reward_tiers','standard'],
  ['merchant_configs',     'standard'],
  ['feature_flags',        'standard'],
  ['maintenance_mode',     'admin_only'],
  ['tenant_maintenance_modes','admin_only'],
  ['login_2fa_settings',   'admin_only'],
  ['error_reports',        'standard'],
  ['user_data_store',      'standard'],
  ['shared_data_store',    'standard'],
  ['invitation_codes',     'standard'],
  ['shift_handovers',      'standard'],
  ['shift_receivers',      'standard'],
  ['member_portal_settings','standard'],
  ['prizes',               'standard'],
  ['tasks',                'standard'],
  ['task_comments',        'standard'],
  ['task_templates',       'standard'],
  ['member_activity',      'standard'],
  ['card_types',           'standard'],
  ['report_titles',        'standard'],
  ['exchange_rate_state',  'standard'],
  ['currencies',           'standard'],
  ['customer_sources',     'standard'],
  ['data_settings',        'admin_only'],
  ['ledger_transactions',  'standard'],
  ['balance_change_logs',  'standard'],
  ['notifications',        'standard'],
  ['site_notifications',   'standard'],
  ['user_preferences',     'standard'],
  ['web_vitals',           'standard'],
  ['tenant_feature_flags', 'admin_only'],
  ['vendor_settlements',   'standard'],
  ['payment_settlements',  'standard'],
  ['extract_settings',     'standard'],
  ['system_announcements', 'standard'],
]);

export function getTableTier(table: string): TableTier | null {
  return TABLE_TIERS.get(table) ?? null;
}

/** 供备份等模块校验表名是否在白名单内 */
export function isTableProxyAllowed(table: string): boolean {
  return TABLE_TIERS.has(table);
}

export function rejectTableAccess(res: Response, _table: string, reason: string): void {
  res.status(403).json({
    success: false,
    message: reason,
    data: null,
    error: { message: reason },
  });
}

/** 员工邀请码：平台超管现在也允许管理（不再阻断） */
// blockPlatformSuperStaffInvitationCodes 已废弃，保留导出签名以免破坏 import
export function blockPlatformSuperStaffInvitationCodes(
  _req: AuthenticatedRequest,
  _res: Response,
  _table: string,
): boolean {
  return false;
}

export function isAdminUser(req: AuthenticatedRequest): boolean {
  return !!(
    req.user?.role === 'admin' ||
    req.user?.is_super_admin ||
    req.user?.is_platform_super_admin
  );
}

/**
 * 含 tenant_id：非平台超管员工走表代理时强制按 JWT tenant_id 过滤（SELECT/UPDATE/DELETE），INSERT 强制写入当前租户。
 */
export const TENANT_SCOPED_TABLES = new Set([
  'activity_gifts',
  'announcements',
  'api_keys',
  'employees',
  'error_reports',
  'gift_cards',
  'invitation_codes',
  'knowledge_articles',
  'knowledge_categories',
  'login_2fa_settings',
  'lottery_logs',
  'lottery_prizes',
  'lottery_settings',
  'member_activity',
  'member_operation_logs',
  'member_points_mall_items',
  'member_portal_settings',
  'member_portal_settings_versions',
  'member_spin_wheel_prizes',
  'members',
  'merchant_configs',
  'orders',
  'phone_pool',
  'points_accounts',
  'points_ledger',
  'phone_reservations',
  'points_log',
  'shared_data_store',
  'site_messages',
  'spin_credits',
  'task_templates',
  'tasks',
  'tenant_feature_flags',
  'tenant_maintenance_modes',
  'webhook_event_queue',
  'webhooks',
]);

function mergeEmployeeTenantScope(
  req: AuthenticatedRequest,
  table: string,
  where: string,
  values: unknown[],
): { where: string; values: unknown[] } {
  if (!TENANT_SCOPED_TABLES.has(table)) return { where, values };
  const scope = req.accessScope ?? resolveAccessScope(req);
  if (scope.principalType !== 'employee') return { where, values };
  if (scope.isPlatformSuperAdmin) return { where, values };
  const tid = scope.tenantId;
  if (!tid) return { where, values };
  const clause = '`tenant_id` <=> ?';
  const nextValues = [...values, tid];
  if (!where?.trim()) {
    return { where: `WHERE ${clause}`, values: nextValues };
  }
  return { where: `${where} AND (${clause})`, values: nextValues };
}

/** 含 user_id：非平台超管员工仅本人行 */
const EMPLOYEE_SELF_BY_USER_ID_TABLES = new Set(['notifications', 'user_data_store']);
/** 含 employee_id：非平台超管员工仅本人行 */
const EMPLOYEE_SELF_BY_EMPLOYEE_ID_TABLES = new Set(['knowledge_read_status']);

function appendWhereEq(
  where: string,
  values: unknown[],
  column: string,
  value: unknown,
): { where: string; values: unknown[] } {
  const clause = `\`${column}\` <=> ?`;
  const nextValues = [...values, value];
  if (!where?.trim()) {
    return { where: `WHERE ${clause}`, values: nextValues };
  }
  return { where: `${where} AND (${clause})`, values: nextValues };
}

/**
 * 租户列过滤 + 个人表按 user_id / employee_id 收口（平台超管除外）。
 */
export function mergeEmployeeAccessScope(
  req: AuthenticatedRequest,
  table: string,
  where: string,
  values: unknown[],
): { where: string; values: unknown[] } {
  let out = mergeEmployeeTenantScope(req, table, where, values);

  /** 审核记录：租户员工仅能读写「本租户员工提交」的行，避免串租户猜 ID */
  if (table === 'audit_records' && req.user?.type === 'employee' && !req.user.is_platform_super_admin) {
    const tid = req.user.tenant_id ?? null;
    if (tid) {
      const clause = '`submitter_id` IN (SELECT `id` FROM `employees` WHERE `tenant_id` <=> ?)';
      const nextValues = [...out.values, tid];
      out = {
        where: out.where?.trim() ? `${out.where} AND (${clause})` : `WHERE (${clause})`,
        values: nextValues,
      };
    }
  }

  if (table === 'web_vitals' && req.user?.type === 'employee' && !req.user.is_platform_super_admin) {
    const tid = req.user.tenant_id ?? null;
    const uid = req.user.id ?? null;
    if (tid) {
      const clause =
        '(`employee_id` IS NULL OR `employee_id` IN (SELECT `id` FROM `employees` WHERE `tenant_id` <=> ?))';
      const nextValues = [...out.values, tid];
      out = {
        where: out.where?.trim() ? `${out.where} AND (${clause})` : `WHERE ${clause}`,
        values: nextValues,
      };
    } else if (uid) {
      const clause = '(`employee_id` <=> ? OR `employee_id` IS NULL)';
      const nextValues = [...out.values, uid];
      out = {
        where: out.where?.trim() ? `${out.where} AND (${clause})` : `WHERE ${clause}`,
        values: nextValues,
      };
    }
    return out;
  }

  if (req.user?.type !== 'employee' || req.user.is_platform_super_admin) return out;
  const eid = req.user.id;
  if (!eid) return out;
  if (EMPLOYEE_SELF_BY_USER_ID_TABLES.has(table)) {
    out = appendWhereEq(out.where, out.values, 'user_id', eid);
  }
  if (EMPLOYEE_SELF_BY_EMPLOYEE_ID_TABLES.has(table)) {
    out = appendWhereEq(out.where, out.values, 'employee_id', eid);
  }
  return out;
}

/** 会员端仅允许 RPC（member_* 等）；表代理直连可扫全表，必须用员工 JWT */
export function blockMemberTableProxy(req: AuthenticatedRequest, res: Response): boolean {
  if (req.user?.type !== 'member') return false;
  res.status(403).json({
    success: false,
    message: 'MEMBER_TABLE_PROXY_FORBIDDEN',
    data: null,
    error: { message: 'Member JWT cannot access table proxy; use /api/data/rpc/*' },
  });
  return true;
}

export function assertRpcEmployee(req: AuthenticatedRequest): boolean {
  return req.user?.type === 'employee' && !!req.user.id;
}

/**
 * 会员 JWT 禁止通过 p_member_id 冒充他人；员工可传 p_member_id 代查。
 */
export function effectiveMemberIdForRpc(req: AuthenticatedRequest, params: Record<string, unknown>): string | null {
  if (req.user?.type === 'member') {
    return req.user.id ?? null;
  }
  const p = params.p_member_id;
  if (p != null && String(p).trim() !== '') return String(p).trim();
  return req.user?.id ?? null;
}

// 列名映射：某些表的前端列名与 MySQL 实际列名不同
export const COLUMN_ALIAS_MAP: Record<string, Record<string, string>> = {
  /** 前端/创建订单使用 order_type（礼品卡 id）；MySQL 补丁列为 card_type */
  orders: { order_type: 'card_type' },
  /** 前端沿用 Supabase 的 current_points，MySQL 账务列为 balance */
  points_accounts: { current_points: 'balance' },
  user_data_store: { data_key: 'store_key', data_value: 'store_value' },
  shared_data_store: { data_key: 'store_key', data_value: 'store_value', key_name: 'store_key', value: 'store_value' },
  /** MySQL notifications 表沿用 user_id / content，与 Supabase 的 recipient_id / message 对齐 */
  notifications: { recipient_id: 'user_id', message: 'content' },
  /** 前端上报 metadata → 库表 context(JSON) */
  error_reports: { metadata: 'context' },
};

export function mapColumnName(table: string, col: string): string {
  return COLUMN_ALIAS_MAP[table]?.[col] ?? col;
}

export function getReverseAliasMap(table: string): Record<string, string> | null {
  const map = COLUMN_ALIAS_MAP[table];
  if (!map) return null;
  const reverse: Record<string, string> = {};
  for (const [frontend, db] of Object.entries(map)) {
    reverse[db] = frontend;
  }
  return reverse;
}

export function mapBodyColumns(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const aliasMap = COLUMN_ALIAS_MAP[table];
  if (!aliasMap) return row;
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const dbCol = aliasMap[key] ?? key;
    mapped[dbCol] = value;
  }
  return mapped;
}

/**
 * Convert ISO 8601 datetime strings to MySQL format, aligned to Asia/Shanghai (+08:00)
 * session timezone so WHERE comparisons match DATETIME values stored by NOW().
 */
import { toMySqlDatetime as shanghaiToMySqlDatetime } from '../../lib/shanghaiTime.js';
export function toMySqlDatetime(val: unknown): unknown {
  if (val instanceof Date) return shanghaiToMySqlDatetime(val);
  if (typeof val !== 'string') return val;
  return shanghaiToMySqlDatetime(val);
}

// 解析 Supabase 风格的过滤参数
export function parseFilters(params: Record<string, string>, table?: string): { where: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const skip = new Set(['select', 'order', 'limit', 'offset', 'count', 'single', 'textsearch', 'or']);

  for (const [rawKey, val] of Object.entries(params)) {
    if (skip.has(rawKey)) continue;
    const key = table ? mapColumnName(table, rawKey) : rawKey;
    // 防止 SQL 注入：列名必须仅含字母、数字、下划线
    if (!SAFE_COLUMN_RE.test(key)) continue;

    if (val.startsWith('eq.')) {
      conditions.push(`\`${key}\` = ?`);
      const eqVal = val.slice(3);
      values.push(eqVal === 'true' ? 1 : eqVal === 'false' ? 0 : toMySqlDatetime(eqVal));
    } else if (val.startsWith('neq.')) {
      conditions.push(`\`${key}\` != ?`);
      const neqVal = val.slice(4);
      values.push(neqVal === 'true' ? 1 : neqVal === 'false' ? 0 : toMySqlDatetime(neqVal));
    } else if (val.startsWith('gt.')) {
      conditions.push(`\`${key}\` > ?`);
      values.push(toMySqlDatetime(val.slice(3)));
    } else if (val.startsWith('gte.')) {
      conditions.push(`\`${key}\` >= ?`);
      values.push(toMySqlDatetime(val.slice(4)));
    } else if (val.startsWith('lt.')) {
      conditions.push(`\`${key}\` < ?`);
      values.push(toMySqlDatetime(val.slice(3)));
    } else if (val.startsWith('lte.')) {
      conditions.push(`\`${key}\` <= ?`);
      values.push(toMySqlDatetime(val.slice(4)));
    } else if (val.startsWith('like.')) {
      conditions.push(`\`${key}\` LIKE ?`);
      values.push(val.slice(5));
    } else if (val.startsWith('ilike.')) {
      conditions.push(`LOWER(\`${key}\`) LIKE LOWER(?)`);
      values.push(val.slice(6));
    } else if (val.startsWith('in.(') && val.endsWith(')')) {
      const items = val.slice(4, -1).split(',').map(s => s.trim());
      if (items.length > 0) {
        conditions.push(`\`${key}\` IN (${items.map(() => '?').join(',')})`);
        values.push(...items);
      }
    } else if (val.startsWith('is.')) {
      const v = val.slice(3);
      if (v === 'null') conditions.push(`\`${key}\` IS NULL`);
      else if (v === 'true') conditions.push(`\`${key}\` = 1`);
      else if (v === 'false') conditions.push(`\`${key}\` = 0`);
    } else if (val.startsWith('not.')) {
      const rest = val.slice(4);
      if (rest.startsWith('eq.')) {
        conditions.push(`\`${key}\` != ?`);
        const notEqVal = rest.slice(3);
        values.push(notEqVal === 'true' ? 1 : notEqVal === 'false' ? 0 : notEqVal);
      } else if (rest.startsWith('is.null')) {
        conditions.push(`\`${key}\` IS NOT NULL`);
      }
    } else if (val.startsWith('cs.')) {
      try {
        const jsonVal = val.slice(3);
        conditions.push(`JSON_CONTAINS(\`${key}\`, ?)`);
        values.push(jsonVal);
      } catch { /* skip */ }
    }
  }

  // OR filters
  if (params.or) {
    const orParts = params.or.split(',');
    const orConditions: string[] = [];
    for (const part of orParts) {
      const m = part.match(/^(\w+)\.(\w+)\.(.+)$/);
      if (m) {
        const [, colRaw, op, v] = m;
        const col = table ? mapColumnName(table, colRaw) : colRaw;
        // 防止 SQL 注入：OR 分支列名也必须校验
        if (!SAFE_COLUMN_RE.test(col)) continue;
        if (op === 'eq') { orConditions.push(`\`${col}\` = ?`); values.push(v); }
        else if (op === 'ilike') { orConditions.push(`LOWER(\`${col}\`) LIKE LOWER(?)`); values.push(v); }
        else if (op === 'like') { orConditions.push(`\`${col}\` LIKE ?`); values.push(v); }
      }
    }
    if (orConditions.length > 0) {
      conditions.push(`(${orConditions.join(' OR ')})`);
    }
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
}

/** 合法列名：字母、数字、下划线，防止 ORDER BY 注入 */
export const SAFE_COLUMN_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function parseOrder(orderStr?: string, table?: string): string {
  if (!orderStr) return '';
  const parts: string[] = [];
  for (const p of orderStr.split(',')) {
    const [col, dir] = p.split('.');
    const rawCol = (col || '').trim();
    if (!SAFE_COLUMN_RE.test(rawCol)) continue;
    const dbCol = table ? mapColumnName(table, rawCol) : rawCol;
    if (!SAFE_COLUMN_RE.test(dbCol)) continue;
    parts.push(`\`${dbCol}\` ${dir === 'desc' ? 'DESC' : 'ASC'}`);
  }
  return parts.length ? `ORDER BY ${parts.join(', ')}` : '';
}
