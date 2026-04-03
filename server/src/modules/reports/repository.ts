/**
 * Reports Repository - 报表数据查询 (MySQL)
 */
import { query } from '../../database/index.js';
import { toMySqlDatetime, getShanghaiDateString } from '../../lib/shanghaiTime.js';
import type { DashboardStats, DashboardTrendResult } from './types.js';

export async function getDashboardStatsRepository(
  tenantId?: string | null,
  isPlatformAdmin?: boolean
): Promise<DashboardStats> {
  // 与库/业务一致：按 Asia/Shanghai 日历日统计「今日订单」，避免 Node 进程 TZ 非 +8 时偏差
  const todayStr = `${getShanghaiDateString()} 00:00:00`;

  const tenantsRes = isPlatformAdmin
    ? await query<{ count: number }>('SELECT COUNT(*) as count FROM tenants')
    : [{ count: 0 }];

  const empParams: any[] = tenantId ? [tenantId] : [];
  const empSql = tenantId
    ? "SELECT COUNT(*) as count FROM employees WHERE status = 'active' AND tenant_id = ?"
    : "SELECT COUNT(*) as count FROM employees WHERE status = 'active'";

  const ordersParams: any[] = tenantId ? [todayStr, tenantId] : [todayStr];
  const ordersSql = tenantId
    ? "SELECT COUNT(*) as count FROM orders WHERE created_at >= ? AND (tenant_id = ? OR tenant_id IS NULL) AND (is_deleted = false OR is_deleted IS NULL) AND (status IS NULL OR status <> 'cancelled')"
    : "SELECT COUNT(*) as count FROM orders WHERE created_at >= ? AND (is_deleted = false OR is_deleted IS NULL) AND (status IS NULL OR status <> 'cancelled')";

  const auditParams: any[] = tenantId ? [tenantId] : [];
  const auditSql = tenantId
    ? "SELECT COUNT(*) as count FROM audit_records WHERE status = 'pending' AND submitter_id IN (SELECT id FROM employees WHERE tenant_id = ?)"
    : "SELECT COUNT(*) as count FROM audit_records WHERE status = 'pending'";

  const [empRes, ordersRes, auditsRes] = await Promise.all([
    query<{ count: number }>(empSql, empParams),
    query<{ count: number }>(ordersSql, ordersParams),
    query<{ count: number }>(auditSql, auditParams),
  ]);

  return {
    tenants: Number(tenantsRes[0]?.count ?? 0),
    activeEmployees: Number(empRes[0]?.count ?? 0),
    todayOrders: Number(ordersRes[0]?.count ?? 0),
    pendingAudits: Number(auditsRes[0]?.count ?? 0),
  };
}

export async function getDashboardTrendRepository(params: {
  startDate: string;
  endDate: string;
  salesPerson?: string | null;
  tenantId?: string | null;
}): Promise<DashboardTrendResult> {
  const startDate = toMySqlDatetime(params.startDate);
  const endDate = toMySqlDatetime(params.endDate);
  const salesPerson = params.salesPerson ?? null;
  const tenantId = params.tenantId ?? null;
  const emptySummary = {
    totalOrders: 0,
    tradingUsers: 0,
    ngnVolume: 0,
    ghsVolume: 0,
    usdtVolume: 0,
    ngnProfit: 0,
    ghsProfit: 0,
    usdtProfit: 0,
  };

  const rawRows = await query<{
    day_date: string | null;
    order_count: string | number | null;
    profit: string | number | null;
    trading_users: string | number | null;
    ngn_volume: string | number | null;
    ghs_volume: string | number | null;
    usdt_volume: string | number | null;
    ngn_profit: string | number | null;
    ghs_profit: string | number | null;
    usdt_profit: string | number | null;
  }>(
    `WITH RECURSIVE date_series AS (
       SELECT DATE(?) AS d
       UNION ALL
       SELECT DATE_ADD(d, INTERVAL 1 DAY) FROM date_series WHERE d < DATE(?)
     ),
     base_filter AS (
       SELECT
         o.created_at,
         COALESCE(NULLIF(TRIM(o.phone_number), ''), m.phone_number) AS phone_number,
         o.currency,
         o.amount,
         o.profit_ngn,
         o.profit_usdt
       FROM orders o
       LEFT JOIN employees e ON COALESCE(o.sales_user_id, o.creator_id, o.employee_id) = e.id
       LEFT JOIN members m ON o.member_id = m.id
       WHERE (o.status IS NULL OR o.status <> 'cancelled')
         AND (o.is_deleted = false OR o.is_deleted IS NULL)
         AND o.created_at >= ?
         AND o.created_at <= ?
         AND (? IS NULL OR e.real_name = ?)
         AND (
           ? IS NULL
           OR COALESCE(o.tenant_id, e.tenant_id, m.tenant_id) = ?
         )
     ),
     normal_orders AS (
       SELECT
         DATE(bf.created_at) AS d,
         COUNT(*) AS cnt,
         COALESCE(SUM(bf.profit_ngn), 0) AS total_profit,
         COALESCE(SUM(CASE WHEN bf.currency IN ('NGN', '奈拉') THEN bf.amount ELSE 0 END), 0) AS v_ngn,
         COALESCE(SUM(CASE WHEN bf.currency IN ('GHS', '赛地') THEN bf.amount ELSE 0 END), 0) AS v_ghs,
         COALESCE(SUM(CASE WHEN bf.currency IN ('NGN', '奈拉') THEN bf.profit_ngn ELSE 0 END), 0) AS p_ngn,
         COALESCE(SUM(CASE WHEN bf.currency IN ('GHS', '赛地') THEN bf.profit_ngn ELSE 0 END), 0) AS p_ghs
       FROM base_filter bf
       WHERE bf.currency <> 'USDT'
       GROUP BY DATE(bf.created_at)
     ),
     usdt_orders AS (
       SELECT
         DATE(bf.created_at) AS d,
         COUNT(*) AS cnt,
         COALESCE(SUM(bf.profit_usdt), 0) AS total_profit_usdt,
         COALESCE(SUM(bf.amount), 0) AS v_usdt,
         COALESCE(SUM(bf.profit_usdt), 0) AS p_usdt
       FROM base_filter bf
       WHERE bf.currency = 'USDT'
       GROUP BY DATE(bf.created_at)
     ),
     daily_unique_users AS (
       SELECT
         DATE(bf.created_at) AS d,
         COUNT(DISTINCT CASE WHEN bf.phone_number IS NOT NULL AND TRIM(bf.phone_number) <> '' THEN bf.phone_number END) AS unique_phones
       FROM base_filter bf
       GROUP BY DATE(bf.created_at)
     ),
     period_unique_users AS (
       SELECT COUNT(DISTINCT bf.phone_number) AS total
       FROM base_filter bf
       WHERE bf.phone_number IS NOT NULL AND TRIM(bf.phone_number) <> ''
     ),
     period_totals AS (
       SELECT
         COUNT(*) AS total_orders,
         COALESCE(SUM(CASE WHEN bf.currency IN ('NGN', '奈拉') THEN bf.amount ELSE 0 END), 0) AS total_ngn_vol,
         COALESCE(SUM(CASE WHEN bf.currency IN ('GHS', '赛地') THEN bf.amount ELSE 0 END), 0) AS total_ghs_vol,
         COALESCE(SUM(CASE WHEN bf.currency = 'USDT' THEN bf.amount ELSE 0 END), 0) AS total_usdt_vol,
         COALESCE(SUM(CASE WHEN bf.currency IN ('NGN', '奈拉') THEN bf.profit_ngn ELSE 0 END), 0) AS total_ngn_profit,
         COALESCE(SUM(CASE WHEN bf.currency IN ('GHS', '赛地') THEN bf.profit_ngn ELSE 0 END), 0) AS total_ghs_profit,
         COALESCE(SUM(CASE WHEN bf.currency = 'USDT' THEN bf.profit_usdt ELSE 0 END), 0) AS total_usdt_profit
       FROM base_filter bf
     )
     SELECT
       ds.d AS day_date,
       (COALESCE(n.cnt, 0) + COALESCE(u.cnt, 0)) AS order_count,
       (COALESCE(n.total_profit, 0) + COALESCE(u.total_profit_usdt, 0)) AS profit,
       COALESCE(du.unique_phones, 0) AS trading_users,
       COALESCE(n.v_ngn, 0) AS ngn_volume,
       COALESCE(n.v_ghs, 0) AS ghs_volume,
       COALESCE(u.v_usdt, 0) AS usdt_volume,
       COALESCE(n.p_ngn, 0) AS ngn_profit,
       COALESCE(n.p_ghs, 0) AS ghs_profit,
       COALESCE(u.p_usdt, 0) AS usdt_profit
     FROM date_series ds
     LEFT JOIN normal_orders n ON n.d = ds.d
     LEFT JOIN usdt_orders u ON u.d = ds.d
     LEFT JOIN daily_unique_users du ON du.d = ds.d

     UNION ALL

     SELECT
       NULL AS day_date,
       COALESCE((SELECT total_orders FROM period_totals), 0),
       (
         COALESCE((SELECT total_ngn_profit FROM period_totals), 0)
         + COALESCE((SELECT total_ghs_profit FROM period_totals), 0)
         + COALESCE((SELECT total_usdt_profit FROM period_totals), 0)
       ) AS profit,
       COALESCE((SELECT total FROM period_unique_users), 0),
       COALESCE((SELECT total_ngn_vol FROM period_totals), 0),
       COALESCE((SELECT total_ghs_vol FROM period_totals), 0),
       COALESCE((SELECT total_usdt_vol FROM period_totals), 0),
       COALESCE((SELECT total_ngn_profit FROM period_totals), 0),
       COALESCE((SELECT total_ghs_profit FROM period_totals), 0),
       COALESCE((SELECT total_usdt_profit FROM period_totals), 0)
     ORDER BY day_date IS NULL, day_date`,
    [
      startDate, endDate,
      startDate, endDate,
      salesPerson, salesPerson,
      tenantId, tenantId,
    ]
  );

  const mapped = rawRows.map((row) => {
    const day = row.day_date ? new Date(row.day_date) : null;
    return {
      date: day ? `${day.getMonth() + 1}/${day.getDate()}` : '',
      orders: Number(row.order_count) || 0,
      profit: Number(row.profit) || 0,
      users: Number(row.trading_users) || 0,
      ngnVolume: Number(row.ngn_volume) || 0,
      ghsVolume: Number(row.ghs_volume) || 0,
      usdtVolume: Number(row.usdt_volume) || 0,
      ngnProfit: Number(row.ngn_profit) || 0,
      ghsProfit: Number(row.ghs_profit) || 0,
      usdtProfit: Number(row.usdt_profit) || 0,
      _isSummary: !row.day_date,
    };
  });

  const summaryRow = mapped.find((row) => row._isSummary);
  const rows = mapped
    .filter((row) => !row._isSummary)
    .map(({ _isSummary, ...row }) => row);

  return {
    rows,
    summary: summaryRow
      ? {
          totalOrders: summaryRow.orders,
          tradingUsers: summaryRow.users,
          ngnVolume: summaryRow.ngnVolume,
          ghsVolume: summaryRow.ghsVolume,
          usdtVolume: summaryRow.usdtVolume,
          ngnProfit: summaryRow.ngnProfit,
          ghsProfit: summaryRow.ghsProfit,
          usdtProfit: summaryRow.usdtProfit,
        }
      : emptySummary,
  };
}

export async function getOrdersReportRepository(params: {
  startDate?: string;
  endDate?: string;
  creatorId?: string;
  tenantId?: string;
}): Promise<any[]> {
  const conditions: string[] = ['(o.is_deleted = false OR o.is_deleted IS NULL)'];
  const values: any[] = [];
  if (params.startDate) {
    conditions.push(`o.created_at >= ?`);
    values.push(toMySqlDatetime(params.startDate));
  }
  if (params.endDate) {
    conditions.push(`o.created_at <= ?`);
    values.push(toMySqlDatetime(params.endDate));
  }
  if (params.creatorId) {
    conditions.push(`(o.creator_id = ? OR o.employee_id = ?)`);
    values.push(params.creatorId, params.creatorId);
  }
  if (params.tenantId) {
    conditions.push(`(o.tenant_id = ? OR o.tenant_id IS NULL)`);
    values.push(params.tenantId);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      o.id, o.order_number, o.member_id, o.employee_id, o.vendor_id,
      o.currency, o.amount, o.rate, o.total, o.fee,
      o.payment_method, o.payment_provider, o.status, o.remark,
      o.foreign_rate, o.created_at, o.updated_at,
      COALESCE(o.phone_number, m.phone_number) AS phone_number,
      o.actual_payment, o.is_deleted,
      COALESCE(o.creator_id, o.employee_id) AS creator_id,
      o.sales_user_id, o.points_status, o.order_points, o.tenant_id,
      o.card_name, o.card_type, o.card_type AS order_type, o.vendor_name, o.deleted_at,
      o.member_name,
      COALESCE(o.member_code_snapshot, o.member_code, m.member_code) AS member_code_snapshot,
      o.payment_status, o.exchange_rate, o.usdt_amount, o.ghs_amount, o.ngn_amount,
      o.settlement_status, o.vendor_settlement_id, o.payment_settlement_id,
      o.card_merchant_id,
      CASE
        WHEN o.payment_value IS NOT NULL AND o.payment_value > 0 THEN o.payment_value
        WHEN o.foreign_rate IS NOT NULL AND o.foreign_rate > 0 THEN ROUND(o.amount * o.foreign_rate, 2)
        ELSE 0
      END AS payment_value,
      COALESCE(o.card_value, o.amount) AS card_value,
      o.completed_at, o.profit_rate,
      COALESCE(o.profit_ngn, 0) AS profit_ngn,
      COALESCE(o.profit_usdt, 0) AS profit_usdt
    FROM orders o
    LEFT JOIN members m ON o.member_id = m.id
    ${whereClause}
    ORDER BY o.created_at DESC`;

  return await query(sql, values);
}

export async function getActivityGiftsReportRepository(params: {
  startDate?: string;
  endDate?: string;
  creatorId?: string;
  tenantId?: string;
}): Promise<any[]> {
  let creatorIds: string[] | undefined;
  if (params.tenantId && !params.creatorId) {
    const empRows = await query<{ id: string }>(
      'SELECT id FROM employees WHERE tenant_id = ?',
      [params.tenantId]
    );
    creatorIds = empRows.map((r) => r.id);
    if (creatorIds.length === 0) return [];
  }

  const conditions: string[] = [];
  const values: any[] = [];
  if (params.startDate) {
    conditions.push(`created_at >= ?`);
    values.push(toMySqlDatetime(params.startDate));
  }
  if (params.endDate) {
    conditions.push(`created_at <= ?`);
    values.push(toMySqlDatetime(params.endDate));
  }
  if (params.creatorId) {
    conditions.push(`creator_id = ?`);
    values.push(params.creatorId);
  } else if (creatorIds?.length) {
    conditions.push(`creator_id IN (${creatorIds.map(() => '?').join(',')})`);
    values.push(...creatorIds);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return await query(`SELECT * FROM activity_gifts ${whereClause} ORDER BY created_at DESC`, values);
}

export async function getReportBaseEmployeesRepository(tenantId?: string | null): Promise<any[]> {
  if (tenantId) {
    return await query(
      'SELECT id, real_name, username, role FROM employees WHERE tenant_id = ? ORDER BY created_at DESC',
      [tenantId]
    );
  }
  return await query('SELECT id, real_name, username, role FROM employees ORDER BY created_at DESC');
}
