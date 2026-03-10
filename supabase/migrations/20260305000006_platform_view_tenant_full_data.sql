-- 平台超级管理员「进入租户」模式：返回完整真实数据，供前端以租户视角浏览（只读）

-- 1. 完整订单列表（非USDT）- 返回与 orders 表相同结构，供前端直接使用
CREATE OR REPLACE FUNCTION public.platform_get_tenant_orders_full(p_tenant_id uuid)
RETURNS SETOF public.orders
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT o.*
  FROM public.orders o
  WHERE (o.is_deleted = false OR o.is_deleted IS NULL)
    AND o.currency IS DISTINCT FROM 'USDT'
    AND (
      EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.creator_id AND e.tenant_id = p_tenant_id)
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.sales_user_id AND e.tenant_id = p_tenant_id)
    )
  ORDER BY o.created_at DESC;
END;
$fn$;

-- 2. 完整 USDT 订单列表
CREATE OR REPLACE FUNCTION public.platform_get_tenant_usdt_orders_full(p_tenant_id uuid)
RETURNS SETOF public.orders
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT o.*
  FROM public.orders o
  WHERE (o.is_deleted = false OR o.is_deleted IS NULL)
    AND o.currency = 'USDT'
    AND (
      EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.creator_id AND e.tenant_id = p_tenant_id)
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.sales_user_id AND e.tenant_id = p_tenant_id)
    )
  ORDER BY o.created_at DESC;
END;
$fn$;

-- 3. 完整会员列表
CREATE OR REPLACE FUNCTION public.platform_get_tenant_members_full(p_tenant_id uuid)
RETURNS SETOF public.members
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.*
  FROM public.members m
  WHERE (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = m.creator_id AND e.tenant_id = p_tenant_id)
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = m.recorder_id AND e.tenant_id = p_tenant_id)
  )
  ORDER BY m.created_at DESC;
END;
$fn$;

-- 4. 仪表盘趋势数据（与 get_dashboard_trend_data 相同结构，按 p_tenant_id 过滤）
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
  WITH normal_orders AS (
    SELECT
      DATE(o.created_at) AS d,
      COUNT(*) AS cnt,
      COALESCE(SUM(o.profit_ngn), 0) AS total_profit,
      COUNT(DISTINCT o.phone_number) AS unique_phones,
      COALESCE(SUM(CASE WHEN o.currency IN ('NGN', '奈拉') THEN o.amount ELSE 0 END), 0) AS v_ngn,
      COALESCE(SUM(CASE WHEN o.currency IN ('GHS', '赛地') THEN o.amount ELSE 0 END), 0) AS v_ghs,
      COALESCE(SUM(CASE WHEN o.currency IN ('NGN', '奈拉') THEN o.profit_ngn ELSE 0 END), 0) AS p_ngn,
      COALESCE(SUM(CASE WHEN o.currency IN ('GHS', '赛地') THEN o.profit_ngn ELSE 0 END), 0) AS p_ghs
    FROM orders o
    LEFT JOIN employees e ON o.sales_user_id = e.id
    WHERE o.status = 'completed'
      AND (o.is_deleted = false OR o.is_deleted IS NULL)
      AND o.currency != 'USDT'
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
      AND (p_sales_person IS NULL OR e.real_name = p_sales_person)
      AND (EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.creator_id AND e2.tenant_id = p_tenant_id)
           OR EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.sales_user_id AND e2.tenant_id = p_tenant_id))
    GROUP BY DATE(o.created_at)
  ),
  usdt_orders AS (
    SELECT
      DATE(o.created_at) AS d,
      COUNT(*) AS cnt,
      COALESCE(SUM(o.profit_usdt), 0) AS total_profit_usdt,
      COUNT(DISTINCT o.phone_number) AS unique_phones,
      COALESCE(SUM(o.amount), 0) AS v_usdt,
      COALESCE(SUM(o.profit_usdt), 0) AS p_usdt
    FROM orders o
    LEFT JOIN employees e ON o.sales_user_id = e.id
    WHERE o.status = 'completed'
      AND (o.is_deleted = false OR o.is_deleted IS NULL)
      AND o.currency = 'USDT'
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
      AND (p_sales_person IS NULL OR e.real_name = p_sales_person)
      AND (EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.creator_id AND e2.tenant_id = p_tenant_id)
           OR EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.sales_user_id AND e2.tenant_id = p_tenant_id))
    GROUP BY DATE(o.created_at)
  ),
  date_series AS (
    SELECT generate_series(p_start_date::date, p_end_date::date, '1 day'::interval)::date AS d
  )
  SELECT
    ds.d AS day_date,
    (COALESCE(n.cnt, 0) + COALESCE(u.cnt, 0))::bigint AS order_count,
    (COALESCE(n.total_profit, 0) + COALESCE(u.total_profit_usdt, 0))::numeric AS profit,
    (COALESCE(n.unique_phones, 0) + COALESCE(u.unique_phones, 0))::bigint AS trading_users,
    COALESCE(n.v_ngn, 0)::numeric AS ngn_volume,
    COALESCE(n.v_ghs, 0)::numeric AS ghs_volume,
    COALESCE(u.v_usdt, 0)::numeric AS usdt_volume,
    COALESCE(n.p_ngn, 0)::numeric AS ngn_profit,
    COALESCE(n.p_ghs, 0)::numeric AS ghs_profit,
    COALESCE(u.p_usdt, 0)::numeric AS usdt_profit
  FROM date_series ds
  LEFT JOIN normal_orders n ON n.d = ds.d
  LEFT JOIN usdt_orders u ON u.d = ds.d
  ORDER BY ds.d;
END;
$fn$;

-- 5. 租户员工列表（只读）
CREATE OR REPLACE FUNCTION public.platform_get_tenant_employees_full(p_tenant_id uuid)
RETURNS SETOF public.employees
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT e.*
  FROM public.employees e
  WHERE e.tenant_id = p_tenant_id
  ORDER BY e.created_at ASC;
END;
$fn$;
