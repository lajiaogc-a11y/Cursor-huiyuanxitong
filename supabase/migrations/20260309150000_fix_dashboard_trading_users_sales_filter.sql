-- 修复仪表盘交易用户统计
-- 问题：当 p_sales_person 有值时，LEFT JOIN sales_user_id 为 NULL 的订单会导致 e.real_name 为 NULL，
--       (e.real_name = p_sales_person) 为 false，这些订单被错误排除，导致交易用户为 0
-- 修复：sales_user_id 为 NULL 时，用 creator_id 对应的员工判断销售员

-- get_dashboard_trend_data（租户版）
CREATE OR REPLACE FUNCTION public.get_dashboard_trend_data(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_sales_person text DEFAULT NULL::text)
 RETURNS TABLE(day_date date, order_count bigint, profit numeric, trading_users bigint, ngn_volume numeric, ghs_volume numeric, usdt_volume numeric, ngn_profit numeric, ghs_profit numeric, usdt_profit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT e.tenant_id INTO v_tenant_id
  FROM profiles p
  JOIN employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid()
  LIMIT 1;

  RETURN QUERY
  WITH base_filter AS (
    SELECT o.id, o.created_at, o.phone_number, o.currency, o.amount, o.profit_ngn, o.profit_usdt,
           COALESCE(e.real_name, e_creator.real_name) AS sales_real_name,
           COALESCE(e.tenant_id, e_creator.tenant_id) AS sales_tenant_id
    FROM orders o
    LEFT JOIN employees e ON o.sales_user_id = e.id
    LEFT JOIN employees e_creator ON o.sales_user_id IS NULL AND o.creator_id = e_creator.id
    WHERE o.status = 'completed'
      AND o.is_deleted = false
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
      AND (p_sales_person IS NULL OR COALESCE(e.real_name, e_creator.real_name) = p_sales_person)
      AND (v_tenant_id IS NULL OR COALESCE(e.tenant_id, e_creator.tenant_id) = v_tenant_id)
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
    WHERE bf.currency != 'USDT'
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
  ORDER BY ds.d;

  RETURN QUERY
  SELECT
    NULL::date AS day_date,
    COALESCE((SELECT total_orders FROM period_totals), 0)::bigint,
    COALESCE((SELECT total_profit FROM period_totals), 0)::numeric,
    COALESCE((SELECT total FROM period_unique_users), 0)::bigint,
    COALESCE((SELECT total_ngn_vol FROM period_totals), 0)::numeric,
    COALESCE((SELECT total_ghs_vol FROM period_totals), 0)::numeric,
    COALESCE((SELECT total_usdt_vol FROM period_totals), 0)::numeric,
    COALESCE((SELECT total_ngn_profit FROM period_totals), 0)::numeric,
    COALESCE((SELECT total_ghs_profit FROM period_totals), 0)::numeric,
    COALESCE((SELECT total_usdt_profit FROM period_totals), 0)::numeric;
END;
$function$;

-- platform_get_dashboard_trend_data（平台查看租户仪表盘）
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
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH base_filter AS (
    SELECT o.id, o.created_at, o.phone_number, o.currency, o.amount, o.profit_ngn, o.profit_usdt
    FROM orders o
    LEFT JOIN employees e ON o.sales_user_id = e.id
    LEFT JOIN employees e_creator ON o.sales_user_id IS NULL AND o.creator_id = e_creator.id
    WHERE o.status = 'completed'
      AND (o.is_deleted = false OR o.is_deleted IS NULL)
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
      AND (p_sales_person IS NULL OR COALESCE(e.real_name, e_creator.real_name) = p_sales_person)
      AND (EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.creator_id AND e2.tenant_id = p_tenant_id)
           OR EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.sales_user_id AND e2.tenant_id = p_tenant_id))
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
    WHERE bf.currency != 'USDT'
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
  ORDER BY ds.d;

  RETURN QUERY
  SELECT
    NULL::date AS day_date,
    COALESCE((SELECT total_orders FROM period_totals), 0)::bigint,
    COALESCE((SELECT total_profit FROM period_totals), 0)::numeric,
    COALESCE((SELECT total FROM period_unique_users), 0)::bigint,
    COALESCE((SELECT total_ngn_vol FROM period_totals), 0)::numeric,
    COALESCE((SELECT total_ghs_vol FROM period_totals), 0)::numeric,
    COALESCE((SELECT total_usdt_vol FROM period_totals), 0)::numeric,
    COALESCE((SELECT total_ngn_profit FROM period_totals), 0)::numeric,
    COALESCE((SELECT total_ghs_profit FROM period_totals), 0)::numeric,
    COALESCE((SELECT total_usdt_profit FROM period_totals), 0)::numeric;
END;
$fn$;
