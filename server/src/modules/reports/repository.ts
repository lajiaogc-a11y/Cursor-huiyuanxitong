/**
 * Reports Repository - 报表数据查询
 * 优先使用 pg 直连（绕过 RLS），与 members/orders 一致
 */
import { supabaseAdmin } from '../../database/index.js';
import { getPgPool, queryPg } from '../../database/pg.js';
import type { DashboardStats, DashboardTrendResult } from './types.js';

export async function getDashboardStatsRepository(
  tenantId?: string | null,
  isPlatformAdmin?: boolean
): Promise<DashboardStats> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStr = todayStart.toISOString();

  if (getPgPool()) {
    const tenantsRes = isPlatformAdmin
      ? await queryPg<{ count: string }>('SELECT COUNT(*)::int as count FROM tenants')
      : [{ count: '0' }];
    const empParams = tenantId ? [tenantId] : [];
    const empSql = tenantId
      ? "SELECT COUNT(*)::int as count FROM employees WHERE status = 'active' AND tenant_id = $1"
      : "SELECT COUNT(*)::int as count FROM employees WHERE status = 'active'";
    const ordersParams = tenantId ? [todayStr, tenantId] : [todayStr];
    const ordersSql = tenantId
      ? "SELECT COUNT(*)::int as count FROM orders WHERE created_at >= $1 AND tenant_id = $2 AND (is_deleted = false OR is_deleted IS NULL)"
      : 'SELECT COUNT(*)::int as count FROM orders WHERE created_at >= $1 AND (is_deleted = false OR is_deleted IS NULL)';
    const auditParams = tenantId ? [tenantId] : [];
    const auditSql = tenantId
      ? "SELECT COUNT(*)::int as count FROM audit_records WHERE status = 'pending' AND submitter_id IN (SELECT id FROM employees WHERE tenant_id = $1)"
      : "SELECT COUNT(*)::int as count FROM audit_records WHERE status = 'pending'";
    const [empRes, ordersRes, auditsRes] = await Promise.all([
      queryPg<{ count: string }>(empSql, empParams),
      queryPg<{ count: string }>(ordersSql, ordersParams),
      queryPg<{ count: string }>(auditSql, auditParams),
    ]);
    return {
      tenants: parseInt(tenantsRes[0]?.count ?? '0', 10),
      activeEmployees: parseInt(empRes[0]?.count ?? '0', 10),
      todayOrders: parseInt(ordersRes[0]?.count ?? '0', 10),
      pendingAudits: parseInt(auditsRes[0]?.count ?? '0', 10),
    };
  }

  const tenantsPromise = isPlatformAdmin
    ? supabaseAdmin.from('tenants').select('*', { count: 'exact', head: true }).then((r) => ({ count: r.error ? 0 : (r.count ?? 0) }))
    : Promise.resolve({ count: 0 });

  let empQ = supabaseAdmin.from('employees').select('*', { count: 'exact', head: true }).eq('status', 'active');
  let ordersQ = supabaseAdmin.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayStr);
  let auditsQ = supabaseAdmin.from('audit_records').select('*', { count: 'exact', head: true }).eq('status', 'pending');

  if (tenantId) {
    empQ = empQ.eq('tenant_id', tenantId);
    ordersQ = ordersQ.eq('tenant_id', tenantId);
    const { data: submitterIds } = await supabaseAdmin.from('employees').select('id').eq('tenant_id', tenantId);
    const ids = (submitterIds ?? []).map((r) => r.id);
    if (ids.length === 0) {
      auditsQ = auditsQ.eq('id', '00000000-0000-0000-0000-000000000000');
    } else {
      auditsQ = auditsQ.in('submitter_id', ids);
    }
  }

  const [tenantsRes, empRes, ordersRes, auditsRes] = await Promise.all([
    tenantsPromise,
    empQ.then((r) => ({ count: r.error ? 0 : (r.count ?? 0) })),
    ordersQ.then((r) => ({ count: r.error ? 0 : (r.count ?? 0) })),
    auditsQ.then((r) => ({ count: r.error ? 0 : (r.count ?? 0) })),
  ]);

  return {
    tenants: tenantsRes.count,
    activeEmployees: empRes.count,
    todayOrders: ordersRes.count,
    pendingAudits: auditsRes.count,
  };
}

export async function getDashboardTrendRepository(params: {
  startDate: string;
  endDate: string;
  salesPerson?: string | null;
  tenantId?: string | null;
}): Promise<DashboardTrendResult> {
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

  if (!getPgPool()) {
    return { rows: [], summary: emptySummary };
  }

  const rawRows = await queryPg<{
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
    `WITH base_filter AS (
       SELECT
         o.created_at,
         COALESCE(NULLIF(TRIM(o.phone_number), ''), m.phone_number) AS phone_number,
         o.currency,
         o.amount,
         o.profit_ngn,
         o.profit_usdt
       FROM orders o
       LEFT JOIN employees e ON o.sales_user_id = e.id
       LEFT JOIN employees e_creator ON o.sales_user_id IS NULL AND o.creator_id = e_creator.id
       LEFT JOIN members m ON o.member_id = m.id
       WHERE o.status = 'completed'
         AND (o.is_deleted = false OR o.is_deleted IS NULL)
         AND o.created_at >= $1::timestamptz
         AND o.created_at <= $2::timestamptz
         AND ($3::text IS NULL OR COALESCE(e.real_name, e_creator.real_name) = $3::text)
         AND (
           $4::uuid IS NULL
           OR COALESCE(o.tenant_id, e.tenant_id, e_creator.tenant_id, m.tenant_id) = $4::uuid
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
         COUNT(DISTINCT CASE WHEN bf.phone_number IS NOT NULL AND TRIM(bf.phone_number) <> '' THEN bf.phone_number END)::bigint AS unique_phones
       FROM base_filter bf
       GROUP BY DATE(bf.created_at)
     ),
     period_unique_users AS (
       SELECT COUNT(DISTINCT bf.phone_number)::bigint AS total
       FROM base_filter bf
       WHERE bf.phone_number IS NOT NULL AND TRIM(bf.phone_number) <> ''
     ),
     period_totals AS (
       SELECT
         COUNT(*)::bigint AS total_orders,
         COALESCE(SUM(CASE WHEN bf.currency IN ('NGN', '奈拉') THEN bf.amount ELSE 0 END), 0)::numeric AS total_ngn_vol,
         COALESCE(SUM(CASE WHEN bf.currency IN ('GHS', '赛地') THEN bf.amount ELSE 0 END), 0)::numeric AS total_ghs_vol,
         COALESCE(SUM(CASE WHEN bf.currency = 'USDT' THEN bf.amount ELSE 0 END), 0)::numeric AS total_usdt_vol,
         COALESCE(SUM(CASE WHEN bf.currency IN ('NGN', '奈拉') THEN bf.profit_ngn ELSE 0 END), 0)::numeric AS total_ngn_profit,
         COALESCE(SUM(CASE WHEN bf.currency IN ('GHS', '赛地') THEN bf.profit_ngn ELSE 0 END), 0)::numeric AS total_ghs_profit,
         COALESCE(SUM(CASE WHEN bf.currency = 'USDT' THEN bf.profit_usdt ELSE 0 END), 0)::numeric AS total_usdt_profit
       FROM base_filter bf
     ),
     date_series AS (
       SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS d
     )
     SELECT
       ds.d AS day_date,
       (COALESCE(n.cnt, 0) + COALESCE(u.cnt, 0))::bigint AS order_count,
       (COALESCE(n.total_profit, 0) + COALESCE(u.total_profit_usdt, 0))::numeric AS profit,
       COALESCE(du.unique_phones, 0)::bigint AS trading_users,
       COALESCE(n.v_ngn, 0)::numeric AS ngn_volume,
       COALESCE(n.v_ghs, 0)::numeric AS ghs_volume,
       COALESCE(u.v_usdt, 0)::numeric AS usdt_volume,
       COALESCE(n.p_ngn, 0)::numeric AS ngn_profit,
       COALESCE(n.p_ghs, 0)::numeric AS ghs_profit,
       COALESCE(u.p_usdt, 0)::numeric AS usdt_profit
     FROM date_series ds
     LEFT JOIN normal_orders n ON n.d = ds.d
     LEFT JOIN usdt_orders u ON u.d = ds.d
     LEFT JOIN daily_unique_users du ON du.d = ds.d

     UNION ALL

     SELECT
       NULL::date AS day_date,
       COALESCE((SELECT total_orders FROM period_totals), 0)::bigint,
       (
         COALESCE((SELECT total_ngn_profit FROM period_totals), 0)
         + COALESCE((SELECT total_ghs_profit FROM period_totals), 0)
         + COALESCE((SELECT total_usdt_profit FROM period_totals), 0)
       )::numeric AS profit,
       COALESCE((SELECT total FROM period_unique_users), 0)::bigint,
       COALESCE((SELECT total_ngn_vol FROM period_totals), 0)::numeric,
       COALESCE((SELECT total_ghs_vol FROM period_totals), 0)::numeric,
       COALESCE((SELECT total_usdt_vol FROM period_totals), 0)::numeric,
       COALESCE((SELECT total_ngn_profit FROM period_totals), 0)::numeric,
       COALESCE((SELECT total_ghs_profit FROM period_totals), 0)::numeric,
       COALESCE((SELECT total_usdt_profit FROM period_totals), 0)::numeric
     ORDER BY day_date NULLS LAST`,
    [params.startDate, params.endDate, params.salesPerson ?? null, params.tenantId ?? null]
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
  if (getPgPool()) {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;
    if (params.startDate) {
      conditions.push(`created_at >= $${paramIdx++}`);
      values.push(params.startDate);
    }
    if (params.endDate) {
      conditions.push(`created_at <= $${paramIdx++}`);
      values.push(params.endDate);
    }
    if (params.creatorId) {
      conditions.push(`creator_id = $${paramIdx++}`);
      values.push(params.creatorId);
    }
    if (params.tenantId) {
      conditions.push(`tenant_id = $${paramIdx++}`);
      values.push(params.tenantId);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await queryPg(`SELECT * FROM orders ${whereClause} ORDER BY created_at DESC`, values);
    return rows;
  }

  let q = supabaseAdmin
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (params.startDate) q = q.gte('created_at', params.startDate);
  if (params.endDate) q = q.lte('created_at', params.endDate);
  if (params.creatorId) q = q.eq('creator_id', params.creatorId);
  if (params.tenantId) q = q.eq('tenant_id', params.tenantId);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getActivityGiftsReportRepository(params: {
  startDate?: string;
  endDate?: string;
  creatorId?: string;
  tenantId?: string;
}): Promise<any[]> {
  if (getPgPool()) {
    let creatorIds: string[] | undefined;
    if (params.tenantId && !params.creatorId) {
      const empRows = await queryPg<{ id: string }>(
        'SELECT id FROM employees WHERE tenant_id = $1',
        [params.tenantId]
      );
      creatorIds = empRows.map((r) => r.id);
      if (creatorIds.length === 0) return [];
    }

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;
    if (params.startDate) {
      conditions.push(`created_at >= $${paramIdx++}`);
      values.push(params.startDate);
    }
    if (params.endDate) {
      conditions.push(`created_at <= $${paramIdx++}`);
      values.push(params.endDate);
    }
    if (params.creatorId) {
      conditions.push(`creator_id = $${paramIdx++}`);
      values.push(params.creatorId);
    } else if (creatorIds?.length) {
      conditions.push(`creator_id = ANY($${paramIdx++}::uuid[])`);
      values.push(creatorIds);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await queryPg(`SELECT * FROM activity_gifts ${whereClause} ORDER BY created_at DESC`, values);
    return rows;
  }

  let creatorIds: string[] | undefined;
  if (params.tenantId && !params.creatorId) {
    const { data: empIds } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('tenant_id', params.tenantId);
    creatorIds = (empIds ?? []).map((r) => r.id);
    if (creatorIds.length === 0) return [];
  }

  let q = supabaseAdmin
    .from('activity_gifts')
    .select('*')
    .order('created_at', { ascending: false });

  if (params.startDate) q = q.gte('created_at', params.startDate);
  if (params.endDate) q = q.lte('created_at', params.endDate);
  if (params.creatorId) q = q.eq('creator_id', params.creatorId);
  else if (creatorIds?.length) q = q.in('creator_id', creatorIds);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getReportBaseEmployeesRepository(tenantId?: string | null): Promise<any[]> {
  if (getPgPool()) {
    const rows = tenantId
      ? await queryPg('SELECT id, real_name, username, role FROM employees WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId])
      : await queryPg('SELECT id, real_name, username, role FROM employees ORDER BY created_at DESC');
    return rows;
  }
  let q = supabaseAdmin
    .from('employees')
    .select('id, real_name, username, role')
    .order('created_at', { ascending: false });
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
