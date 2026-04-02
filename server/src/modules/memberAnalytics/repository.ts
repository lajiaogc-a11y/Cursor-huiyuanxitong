/**
 * 会员门户网站统计与数据清理（MySQL）
 */
import { randomUUID } from 'node:crypto';
import { query, queryOne, execute } from '../../database/index.js';
import { getShanghaiDateString } from '../../lib/shanghaiTime.js';

/** 仅用于数据清理等「邀请链接会员」策略；网站统计已改为全租户会员，不再使用此条件 */
export const INVITE_LINK_MEMBER_SQL = `(m.referral_source = 'link' AND m.referrer_id IS NOT NULL)`;

export interface WebsiteStatsRow {
  online_now: string | number;
  today_login_users: string | number;
  today_register_count: string | number;
  today_trading_users: string | number;
  range_login_users: string | number;
  range_register_count: string | number;
  range_trading_users: string | number;
  range_total_tx: string | number | null;
  range_card_value_sum: string | number | null;
  cumulative_invite_registers: string | number;
}

function dayStart(d: string): string {
  return `${d.trim()} 00:00:00.000`;
}

function dayEnd(d: string): string {
  return `${d.trim()} 23:59:59.999`;
}

/** 下一自然日 00:00:00（左闭右开区间上界） */
function dayAfterStart(d: string): string {
  const [y, mo, da] = d.trim().split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, mo - 1, da) + 86400000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())} 00:00:00.000`;
}

export async function fetchWebsiteStatsRepository(params: {
  tenantId: string;
  rangeStartDate: string;
  rangeEndDate: string;
}): Promise<WebsiteStatsRow> {
  const { tenantId } = params;
  const today = getShanghaiDateString();
  const rs = dayStart(params.rangeStartDate);
  const re = dayEnd(params.rangeEndDate);
  const todayStart = dayStart(today);
  const todayAfter = dayAfterStart(today);

  /** 网站统计：本租户 `members` 全量（不区分门户邀请注册与后台录入等来源） */
  const row = await queryOne<WebsiteStatsRow>(
    `SELECT
       (SELECT COUNT(*) FROM members m
         WHERE m.tenant_id = ?
           AND m.last_seen_at >= NOW(3) - INTERVAL 15 MINUTE
           AND (m.status IS NULL OR LOWER(TRIM(m.status)) = 'active')
       ) AS online_now,

       (SELECT COUNT(DISTINCT l.member_id) FROM member_login_logs l
         INNER JOIN members m ON m.id = l.member_id
         WHERE m.tenant_id = ?
           AND l.login_at >= ? AND l.login_at < ?
       ) AS today_login_users,

       (SELECT COUNT(*) FROM members m
         WHERE m.tenant_id = ?
           AND m.created_at >= ? AND m.created_at < ?
       ) AS today_register_count,

       (SELECT COUNT(DISTINCT o.member_id) FROM orders o
         INNER JOIN members m ON m.id = o.member_id
         WHERE m.tenant_id = ?
           AND (o.status IS NULL OR o.status <> 'cancelled')
           AND (o.is_deleted = false OR o.is_deleted IS NULL)
           AND o.member_id IS NOT NULL
           AND o.created_at >= ? AND o.created_at < ?
       ) AS today_trading_users,

       (SELECT COUNT(DISTINCT l.member_id) FROM member_login_logs l
         INNER JOIN members m ON m.id = l.member_id
         WHERE m.tenant_id = ?
           AND l.login_at >= ? AND l.login_at <= ?
       ) AS range_login_users,

       (SELECT COUNT(*) FROM members m
         WHERE m.tenant_id = ?
           AND m.created_at >= ? AND m.created_at <= ?
       ) AS range_register_count,

       (SELECT COUNT(DISTINCT o.member_id) FROM orders o
         INNER JOIN members m ON m.id = o.member_id
         WHERE m.tenant_id = ?
           AND (o.status IS NULL OR o.status <> 'cancelled')
           AND (o.is_deleted = false OR o.is_deleted IS NULL)
           AND o.member_id IS NOT NULL
           AND o.created_at >= ? AND o.created_at <= ?
       ) AS range_trading_users,

       (SELECT COALESCE(SUM(
            COALESCE(o.actual_payment, o.total, o.amount, 0)
          ), 0) FROM orders o
         INNER JOIN members m ON m.id = o.member_id
         WHERE m.tenant_id = ?
           AND (o.status IS NULL OR o.status <> 'cancelled')
           AND (o.is_deleted = false OR o.is_deleted IS NULL)
           AND o.member_id IS NOT NULL
           AND o.created_at >= ? AND o.created_at <= ?
       ) AS range_total_tx,

       (SELECT COALESCE(SUM(
            COALESCE(o.amount, 0) + COALESCE(o.card_value, 0)
          ), 0) FROM orders o
         INNER JOIN members m ON m.id = o.member_id
         WHERE m.tenant_id = ?
           AND (o.status IS NULL OR o.status <> 'cancelled')
           AND (o.is_deleted = false OR o.is_deleted IS NULL)
           AND o.member_id IS NOT NULL
           AND o.created_at >= ? AND o.created_at <= ?
       ) AS range_card_value_sum,

       (SELECT COUNT(*) FROM members m
         WHERE m.tenant_id = ?
           AND m.created_at <= ?
       ) AS cumulative_invite_registers
    `,
    [
      tenantId,
      tenantId, todayStart, todayAfter,
      tenantId, todayStart, todayAfter,
      tenantId, todayStart, todayAfter,
      tenantId, rs, re,
      tenantId, rs, re,
      tenantId, rs, re,
      tenantId, rs, re,
      tenantId, rs, re,
      tenantId, re,
    ],
  );

  return (
    row ?? {
      online_now: 0,
      today_login_users: 0,
      today_register_count: 0,
      today_trading_users: 0,
      range_login_users: 0,
      range_register_count: 0,
      range_trading_users: 0,
      range_total_tx: 0,
      range_card_value_sum: 0,
      cumulative_invite_registers: 0,
    }
  );
}

export interface DataCleanupSettingsRow {
  data_cleanup_enabled: number | boolean;
  data_cleanup_no_trade_months: number | null;
  data_cleanup_no_login_months: number | null;
  data_cleanup_max_points: string | number | null;
}

export async function getDataCleanupSettingsRepository(tenantId: string): Promise<DataCleanupSettingsRow | null> {
  return queryOne<DataCleanupSettingsRow>(
    `SELECT data_cleanup_enabled, data_cleanup_no_trade_months, data_cleanup_no_login_months, data_cleanup_max_points
     FROM member_portal_settings WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
}

/** 尚无门户设置行时插入最小行，便于数据清理规则 UPDATE 与统计 SQL 依赖的库结构一致 */
export async function ensureMemberPortalSettingsRowForTenant(tenantId: string): Promise<void> {
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM member_portal_settings WHERE tenant_id = ? LIMIT 1',
    [tenantId],
  );
  if (existing) return;
  await execute(
    `INSERT INTO member_portal_settings (
       id, tenant_id, company_name, theme_primary_color, welcome_title, welcome_subtitle,
       enable_spin, enable_invite, enable_check_in, enable_share_reward
     ) VALUES (?, ?, 'Spin & Win', '#f59e0b', 'Premium Member Platform', 'Sign in to your member account', 1, 1, 1, 1)`,
    [randomUUID(), tenantId],
  );
}

export async function updateDataCleanupSettingsRepository(
  tenantId: string,
  patch: {
    enabled: boolean;
    noTradeMonths: number | null;
    noLoginMonths: number | null;
    maxPointsBelow: number | null;
  },
): Promise<void> {
  await ensureMemberPortalSettingsRowForTenant(tenantId);
  await execute(
    `UPDATE member_portal_settings SET
       data_cleanup_enabled = ?,
       data_cleanup_no_trade_months = ?,
       data_cleanup_no_login_months = ?,
       data_cleanup_max_points = ?,
       updated_at = NOW(3)
     WHERE tenant_id = ?`,
    [
      patch.enabled ? 1 : 0,
      patch.noTradeMonths,
      patch.noLoginMonths,
      patch.maxPointsBelow,
      tenantId,
    ],
  );
}

/** 列出已启用自动清理的租户 */
export async function listTenantsWithCleanupEnabledRepository(): Promise<string[]> {
  const rows = await query<{ tenant_id: string }>(
    `SELECT tenant_id FROM member_portal_settings WHERE data_cleanup_enabled = 1`,
  );
  return rows.map((r) => r.tenant_id);
}

/**
 * 预览 / 执行：仅处理邀请链接注册会员；三者同时满足（无交易月数、无登录月数、积分低于阈值）
 */
export async function selectMembersMatchingCleanupRepository(tenantId: string): Promise<string[]> {
  const cfg = await getDataCleanupSettingsRepository(tenantId);
  if (!cfg || !cfg.data_cleanup_enabled) return [];
  const tradeM = cfg.data_cleanup_no_trade_months;
  const loginM = cfg.data_cleanup_no_login_months;
  const maxPts = cfg.data_cleanup_max_points;
  if (tradeM == null || tradeM < 1 || loginM == null || loginM < 1 || maxPts == null) {
    return [];
  }
  const maxPointsNum = Number(maxPts);
  if (Number.isNaN(maxPointsNum)) return [];

  const rows = await query<{ id: string }>(
    `SELECT m.id FROM members m
     LEFT JOIN points_accounts pa ON pa.member_id = m.id
     WHERE m.tenant_id = ?
       AND ${INVITE_LINK_MEMBER_SQL}
       AND (m.status IS NULL OR LOWER(TRIM(m.status)) = 'active')
       AND COALESCE(pa.balance, 0) < ?
       AND (
         (SELECT MAX(o.created_at) FROM orders o
           WHERE o.member_id = m.id
             AND (o.status IS NULL OR o.status <> 'cancelled')
             AND (o.is_deleted = false OR o.is_deleted IS NULL)
         ) IS NULL
         OR (SELECT MAX(o.created_at) FROM orders o
           WHERE o.member_id = m.id
             AND (o.status IS NULL OR o.status <> 'cancelled')
             AND (o.is_deleted = false OR o.is_deleted IS NULL)
         ) < DATE_SUB(NOW(3), INTERVAL ? MONTH)
       )
       AND (
         CASE
           WHEN m.last_login_at IS NULL
             AND (SELECT MAX(l.login_at) FROM member_login_logs l WHERE l.member_id = m.id) IS NULL
           THEN m.created_at
           ELSE GREATEST(
             COALESCE(m.last_login_at, '1970-01-01 00:00:00'),
             COALESCE((SELECT MAX(l.login_at) FROM member_login_logs l WHERE l.member_id = m.id), '1970-01-01 00:00:00')
           )
         END
       ) < DATE_SUB(NOW(3), INTERVAL ? MONTH)
    `,
    [tenantId, maxPointsNum, tradeM, loginM],
  );
  return rows.map((r) => r.id);
}

export async function purgeMembersByPolicyRepository(memberIds: string[]): Promise<number> {
  if (memberIds.length === 0) return 0;
  const placeholders = memberIds.map(() => '?').join(',');
  const r = await execute(
    `UPDATE members SET
       status = 'auto_purged',
       password_hash = NULL,
       updated_at = NOW(3)
     WHERE id IN (${placeholders})
       AND (status IS NULL OR LOWER(TRIM(status)) = 'active')`,
    memberIds,
  );
  return Number(r.affectedRows) || 0;
}
