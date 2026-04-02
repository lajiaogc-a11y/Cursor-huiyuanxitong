-- 修复 platform_get_dashboard_trend_data：第二个 RETURN QUERY 引用了第一个的 CTE period_totals
-- 在 PostgreSQL 中每个 RETURN QUERY 作用域独立，需在第二个查询中重新定义 CTE

CREATE OR REPLACE FUNCTION public.platform_get_dashboard_trend_data(
  p_tenant_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_sales_person text DEFAULT NULL
)
RETURNS TABLE(day_date date, order_count bigint, profit numeric, trading_users bigint, ngn_volume numeric, ghs_volume numeric, usdt_volume numeric, ngn_profit numeric, ghs_profit numeric, usdt_profit numeric)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_002_id uuid;
  v_my_tenant_id uuid;
  v_is_002_admin boolean;
BEGIN
  IF public.is_platform_super_admin(auth.uid()) THEN
    NULL;
  ELSE
    SELECT e.tenant_id INTO v_my_tenant_id
    FROM profiles p
    JOIN employees e ON e.id = p.employee_id
    WHERE p.id = auth.uid()
    LIMIT 1;
    SELECT EXISTS (
      SELECT 1 FROM tenants t
      JOIN profiles p ON p.employee_id = t.admin_employee_id AND p.id = auth.uid()
      WHERE t.tenant_code = '002'
    ) INTO v_is_002_admin;
    IF v_my_tenant_id IS DISTINCT FROM p_tenant_id
       AND NOT (v_is_002_admin AND p_tenant_id = (SELECT id FROM tenants WHERE tenant_code = '002' LIMIT 1)) THEN
      RETURN;
    END IF;
  END IF;

  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;

  RETURN QUERY
  WITH base_filter AS (
    SELECT o.id, o.created_at,
           COALESCE(NULLIF(TRIM(o.phone_number), ''), m.phone_number) AS phone_number,
           o.currency, o.amount, o.profit_ngn, o.profit_usdt
    FROM orders o
    LEFT JOIN employees e ON o.sales_user_id = e.id
    LEFT JOIN employees e_creator ON o.sales_user_id IS NULL AND o.creator_id = e_creator.id
    LEFT JOIN members m ON o.member_id = m.id
    WHERE o.status = 'completed'
      AND (o.is_deleted = false OR o.is_deleted IS NULL)
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
      AND (p_sales_person IS NULL OR COALESCE(e.real_name, e_creator.real_name) = p_sales_person)
      AND (
        EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.creator_id AND e2.tenant_id = p_tenant_id)
        OR EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.sales_user_id AND e2.tenant_id = p_tenant_id)
        OR (v_002_id IS NOT NULL AND p_tenant_id = v_002_id AND (
          (o.creator_id IS NOT NULL AND (
            NOT EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.creator_id)
            OR (SELECT e2.tenant_id FROM employees e2 WHERE e2.id = o.creator_id LIMIT 1) IS NULL
          ))
          OR (o.sales_user_id IS NOT NULL AND (
            NOT EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.sales_user_id)
            OR (SELECT e2.tenant_id FROM employees e2 WHERE e2.id = o.sales_user_id LIMIT 1) IS NULL
          ))
          OR (o.creator_id IS NULL AND o.sales_user_id IS NULL)
        ))
      )
  ),
  normal_orders AS (
    SELECT DATE(bf.created_at) AS d,
      COUNT(*) AS cnt,
      COALESCE(SUM(bf.profit_ngn), 0) AS total_profit,
      COALESCE(SUM(CASE WHEN bf.currency IN ('NGN', '奈拉') THEN bf.amount ELSE 0 END), 0) AS v_ngn,
      COALESCE(SUM(CASE WHEN bf.currency IN ('GHS', '赛地') THEN bf.amount ELSE 0 END), 0) AS v_ghs,
      COALESCE(SUM(CASE WHEN bf.currency IN ('NGN', '奈拉') THEN bf.profit_ngn ELSE 0 END), 0) AS p_ngn,
      COALESCE(SUM(CASE WHEN bf.currency IN ('GHS', '赛地') THEN bf.profit_ngn ELSE 0 END), 0) AS p_ghs
    FROM base_filter bf
    WHERE bf.currency != 'USDT'
    GROUP BY DATE(bf.created_at)
  ),
  usdt_orders AS (
    SELECT DATE(bf.created_at) AS d,
      COUNT(*) AS cnt,
      COALESCE(SUM(bf.profit_usdt), 0) AS total_profit_usdt,
      COALESCE(SUM(bf.amount), 0) AS v_usdt,
      COALESCE(SUM(bf.profit_usdt), 0) AS p_usdt
    FROM base_filter bf
    WHERE bf.currency = 'USDT'
    GROUP BY DATE(bf.created_at)
  ),
  daily_unique_users AS (
    SELECT DATE(bf.created_at) AS d,
      COUNT(DISTINCT CASE WHEN bf.phone_number IS NOT NULL AND TRIM(bf.phone_number) != '' THEN bf.phone_number END)::bigint AS unique_phones
    FROM base_filter bf
    GROUP BY DATE(bf.created_at)
  ),
  period_unique_users AS (
    SELECT COUNT(DISTINCT bf.phone_number)::bigint AS total
    FROM base_filter bf
    WHERE bf.phone_number IS NOT NULL AND TRIM(bf.phone_number) != ''
  ),
  period_totals AS (
    SELECT
      COUNT(*)::bigint AS total_orders,
      (COALESCE(SUM(CASE WHEN bf.currency != 'USDT' THEN bf.profit_ngn ELSE 0 END), 0) + COALESCE(SUM(CASE WHEN bf.currency = 'USDT' THEN bf.profit_usdt ELSE 0 END), 0))::numeric AS total_profit,
      COALESCE(SUM(CASE WHEN bf.currency IN ('NGN', '奈拉') THEN bf.amount ELSE 0 END), 0)::numeric AS total_ngn_vol,
      COALESCE(SUM(CASE WHEN bf.currency IN ('GHS', '赛地') THEN bf.amount ELSE 0 END), 0)::numeric AS total_ghs_vol,
      COALESCE(SUM(CASE WHEN bf.currency = 'USDT' THEN bf.amount ELSE 0 END), 0)::numeric AS total_usdt_vol,
      COALESCE(SUM(CASE WHEN bf.currency IN ('NGN', '奈拉') THEN bf.profit_ngn ELSE 0 END), 0)::numeric AS total_ngn_profit,
      COALESCE(SUM(CASE WHEN bf.currency IN ('GHS', '赛地') THEN bf.profit_ngn ELSE 0 END), 0)::numeric AS total_ghs_profit,
      COALESCE(SUM(CASE WHEN bf.currency = 'USDT' THEN bf.profit_usdt ELSE 0 END), 0)::numeric AS total_usdt_profit
    FROM base_filter bf
  ),
  date_series AS (
    SELECT generate_series(p_start_date::date, p_end_date::date, '1 day'::interval)::date AS d
  )
  SELECT ds.d AS day_date,
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
  ORDER BY ds.d;

  -- 第二个 RETURN QUERY 必须有自己的 WITH，否则 period_totals 不在作用域内
  RETURN QUERY
  WITH base_filter2 AS (
    SELECT o.id, o.created_at,
           COALESCE(NULLIF(TRIM(o.phone_number), ''), m.phone_number) AS phone_number,
           o.currency, o.amount, o.profit_ngn, o.profit_usdt
    FROM orders o
    LEFT JOIN employees e ON o.sales_user_id = e.id
    LEFT JOIN employees e_creator ON o.sales_user_id IS NULL AND o.creator_id = e_creator.id
    LEFT JOIN members m ON o.member_id = m.id
    WHERE o.status = 'completed'
      AND (o.is_deleted = false OR o.is_deleted IS NULL)
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
      AND (p_sales_person IS NULL OR COALESCE(e.real_name, e_creator.real_name) = p_sales_person)
      AND (
        EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.creator_id AND e2.tenant_id = p_tenant_id)
        OR EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.sales_user_id AND e2.tenant_id = p_tenant_id)
        OR (v_002_id IS NOT NULL AND p_tenant_id = v_002_id AND (
          (o.creator_id IS NOT NULL AND (
            NOT EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.creator_id)
            OR (SELECT e2.tenant_id FROM employees e2 WHERE e2.id = o.creator_id LIMIT 1) IS NULL
          ))
          OR (o.sales_user_id IS NOT NULL AND (
            NOT EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.sales_user_id)
            OR (SELECT e2.tenant_id FROM employees e2 WHERE e2.id = o.sales_user_id LIMIT 1) IS NULL
          ))
          OR (o.creator_id IS NULL AND o.sales_user_id IS NULL)
        ))
      )
  ),
  period_totals2 AS (
    SELECT
      COUNT(*)::bigint AS total_orders,
      (COALESCE(SUM(CASE WHEN bf.currency != 'USDT' THEN bf.profit_ngn ELSE 0 END), 0) + COALESCE(SUM(CASE WHEN bf.currency = 'USDT' THEN bf.profit_usdt ELSE 0 END), 0))::numeric AS total_profit,
      COALESCE(SUM(CASE WHEN bf.currency IN ('NGN', '奈拉') THEN bf.amount ELSE 0 END), 0)::numeric AS total_ngn_vol,
      COALESCE(SUM(CASE WHEN bf.currency IN ('GHS', '赛地') THEN bf.amount ELSE 0 END), 0)::numeric AS total_ghs_vol,
      COALESCE(SUM(CASE WHEN bf.currency = 'USDT' THEN bf.amount ELSE 0 END), 0)::numeric AS total_usdt_vol,
      COALESCE(SUM(CASE WHEN bf.currency IN ('NGN', '奈拉') THEN bf.profit_ngn ELSE 0 END), 0)::numeric AS total_ngn_profit,
      COALESCE(SUM(CASE WHEN bf.currency IN ('GHS', '赛地') THEN bf.profit_ngn ELSE 0 END), 0)::numeric AS total_ghs_profit,
      COALESCE(SUM(CASE WHEN bf.currency = 'USDT' THEN bf.profit_usdt ELSE 0 END), 0)::numeric AS total_usdt_profit
    FROM base_filter2 bf
  ),
  period_unique_users2 AS (
    SELECT COUNT(DISTINCT bf.phone_number)::bigint AS total
    FROM base_filter2 bf
    WHERE bf.phone_number IS NOT NULL AND TRIM(bf.phone_number) != ''
  )
  SELECT NULL::date,
    COALESCE(pt.total_orders, 0)::bigint,
    COALESCE(pt.total_profit, 0)::numeric,
    COALESCE(pu.total, 0)::bigint,
    COALESCE(pt.total_ngn_vol, 0)::numeric,
    COALESCE(pt.total_ghs_vol, 0)::numeric,
    COALESCE(pt.total_usdt_vol, 0)::numeric,
    COALESCE(pt.total_ngn_profit, 0)::numeric,
    COALESCE(pt.total_ghs_profit, 0)::numeric,
    COALESCE(pt.total_usdt_profit, 0)::numeric
  FROM period_totals2 pt
  CROSS JOIN period_unique_users2 pu;
END;
$fn$;
