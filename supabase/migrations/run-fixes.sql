-- 合并执行：订单统计修复 + 仪表盘交易用户修复
-- 在 Supabase SQL Editor 中执行此文件即可

-- ========== 1. 修复订单筛选统计（卡值总和、利润总和、交易用户）==========
-- 说明：orders 表 RLS 允许 admin/manager/staff 查看全部订单，故统计也应对全部订单求和，不按租户过滤
DROP FUNCTION IF EXISTS public.get_order_filter_stats(text, text, uuid, uuid, uuid, uuid, numeric, numeric, timestamptz, timestamptz, text, uuid);
CREATE OR REPLACE FUNCTION public.get_order_filter_stats(
  p_status text DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_vendor uuid DEFAULT NULL,
  p_payment_provider uuid DEFAULT NULL,
  p_card_type uuid DEFAULT NULL,
  p_creator_id uuid DEFAULT NULL,
  p_min_profit numeric DEFAULT NULL,
  p_max_profit numeric DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_search_term text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE(total_profit numeric, total_card_value numeric, trading_users bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY
  WITH base_orders AS (
    SELECT o.id, o.currency, o.amount, o.profit_ngn, o.profit_usdt, o.card_value, o.exchange_rate,
           COALESCE(NULLIF(TRIM(o.phone_number), ''), m.phone_number) AS member_phone
    FROM orders o
    LEFT JOIN members m ON o.member_id = m.id
    WHERE o.is_deleted = false
      AND (p_status IS NULL OR o.status = p_status)
      AND (p_currency IS NULL OR p_currency = 'all' OR o.currency = p_currency)
      AND (p_vendor IS NULL OR o.card_merchant_id = p_vendor::text)
      AND (p_payment_provider IS NULL OR o.vendor_id = p_payment_provider::text)
      AND (p_card_type IS NULL OR o.order_type = p_card_type::text)
      AND (p_creator_id IS NULL OR o.creator_id = p_creator_id)
      AND (p_min_profit IS NULL OR (o.currency = 'USDT' AND COALESCE(o.profit_usdt, 0) >= p_min_profit) OR ((o.currency IS NULL OR o.currency != 'USDT') AND COALESCE(o.profit_ngn, 0) >= p_min_profit))
      AND (p_max_profit IS NULL OR (o.currency = 'USDT' AND COALESCE(o.profit_usdt, 0) <= p_max_profit) OR ((o.currency IS NULL OR o.currency != 'USDT') AND COALESCE(o.profit_ngn, 0) <= p_max_profit))
      AND (p_start_date IS NULL OR o.created_at >= p_start_date)
      AND (p_end_date IS NULL OR o.created_at <= p_end_date)
      AND (p_search_term IS NULL OR p_search_term = '' OR o.order_number ILIKE '%' || p_search_term || '%' OR o.phone_number ILIKE '%' || p_search_term || '%' OR o.member_code_snapshot ILIKE '%' || p_search_term || '%' OR o.remark ILIKE '%' || p_search_term || '%')
  )
  SELECT
    COALESCE(SUM(CASE WHEN bo.currency = 'USDT' THEN COALESCE(bo.profit_usdt, 0) ELSE COALESCE(bo.profit_ngn, 0) END), 0)::numeric AS total_profit,
    COALESCE(SUM(
      COALESCE(NULLIF(bo.amount, 0), COALESCE(bo.card_value, 0) * COALESCE(bo.exchange_rate, 0), 0)
    ), 0)::numeric AS total_card_value,
    COUNT(DISTINCT CASE WHEN bo.member_phone IS NOT NULL AND TRIM(bo.member_phone) != '' THEN bo.member_phone END)::bigint AS trading_users
  FROM base_orders bo;
END;
$fn$;

-- ========== 2. 修复仪表盘交易用户统计（get_dashboard_trend_data）==========
-- 与订单管理一致：orders RLS 允许 admin/manager/staff 查看全部订单，仪表盘也统计全部已完成订单
CREATE OR REPLACE FUNCTION public.get_dashboard_trend_data(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_sales_person text DEFAULT NULL::text)
 RETURNS TABLE(day_date date, order_count bigint, profit numeric, trading_users bigint, ngn_volume numeric, ghs_volume numeric, usdt_volume numeric, ngn_profit numeric, ghs_profit numeric, usdt_profit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH base_filter AS (
    SELECT o.id, o.created_at,
           COALESCE(NULLIF(TRIM(o.phone_number), ''), m.phone_number) AS phone_number,
           o.currency, o.amount, o.profit_ngn, o.profit_usdt,
           COALESCE(e.real_name, e_creator.real_name) AS sales_real_name
    FROM orders o
    LEFT JOIN employees e ON o.sales_user_id = e.id
    LEFT JOIN employees e_creator ON o.sales_user_id IS NULL AND o.creator_id = e_creator.id
    LEFT JOIN members m ON o.member_id = m.id
    WHERE o.status = 'completed'
      AND o.is_deleted = false
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
      AND (p_sales_person IS NULL OR COALESCE(e.real_name, e_creator.real_name) = p_sales_person)
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
  WITH base_filter2 AS (
    SELECT o.id, o.created_at,
           COALESCE(NULLIF(TRIM(o.phone_number), ''), m.phone_number) AS phone_number,
           o.currency, o.amount, o.profit_ngn, o.profit_usdt
    FROM orders o
    LEFT JOIN employees e ON o.sales_user_id = e.id
    LEFT JOIN employees e_creator ON o.sales_user_id IS NULL AND o.creator_id = e_creator.id
    LEFT JOIN members m ON o.member_id = m.id
    WHERE o.status = 'completed'
      AND o.is_deleted = false
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
      AND (p_sales_person IS NULL OR COALESCE(e.real_name, e_creator.real_name) = p_sales_person)
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
  SELECT
    NULL::date AS day_date,
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
$function$;

-- ========== 3. 修复仪表盘交易用户统计（platform_get_dashboard_trend_data）==========
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
